/**
 * Route Service
 * 
 * Provides route calculation with ECA zone detection and timeline calculation.
 * Uses PortRepository for port data and SeaRoute API for route calculation.
 */

import { PortRepository } from '@/lib/repositories/port-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { SeaRouteAPIClient } from './sea-route-api-client';
import {
  RouteData,
  Waypoint,
  Timeline,
  TimelineEntry,
  ECASegment,
  ECAZone,
} from './types';
import { ECA_ZONES } from '@/lib/tools/eca-config';
import * as turf from '@turf/turf';
import {
  validateCoordinates,
  arrayToObject,
  haversineDistance,
} from '@/lib/utils/coordinate-validator';

export type { RouteData } from './types';

/**
 * Cached route data contract.
 * After Redis/JSON deserialization, dates are ISO 8601 strings.
 */
type CachedRouteData = Omit<RouteData, 'timeline' | 'ecaSegments'> & {
  timeline: Array<Omit<TimelineEntry, 'eta'> & { eta: string | Date }>;
  ecaSegments: Array<
    Omit<ECASegment, 'startTime' | 'endTime'> & {
      startTime: string | Date;
      endTime: string | Date;
    }
  >;
};

/**
 * Type guard for values that may be Date or ISO string.
 */
export function isDateLike(value: unknown): value is Date | string {
  return value instanceof Date || typeof value === 'string';
}

/**
 * Normalizes a value that might be a Date or ISO string into a Date object.
 * Redis/JSON serialization converts Date objects to strings; this restores them.
 *
 * Edge cases: null/undefined/empty → new Date(0) with warn; invalid string → new Date(0) with warn.
 */
export function normalizeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value == null || value === '') {
    console.warn('[RouteService] Encountered null/empty date in cache, using epoch');
    return new Date(0);
  }
  if (!isDateLike(value)) {
    console.warn('[RouteService] Invalid date type in cache:', typeof value);
    return new Date(0);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    console.warn('[RouteService] Invalid date string in cache:', value);
    return new Date(0);
  }
  return d;
}

/**
 * Normalizes all date fields in cached route data to Date instances.
 */
export function normalizeCachedRoute(cached: CachedRouteData): RouteData {
  return {
    ...cached,
    timeline: (cached.timeline ?? []).map((entry) => ({
      ...entry,
      eta: normalizeDate(entry.eta),
    })),
    ecaSegments: (cached.ecaSegments ?? []).map((seg) => ({
      ...seg,
      startTime: normalizeDate(seg.startTime),
      endTime: normalizeDate(seg.endTime),
    })),
  };
}

export class RouteService {
  constructor(
    private portRepo: PortRepository,
    private cache: RedisCache,
    private seaRouteAPI: SeaRouteAPIClient
  ) {}

  /**
   * Calculate route between two ports
   */
  async calculateRoute(params: {
    origin: string; // Port code
    destination: string; // Port code
    speed: number; // Knots
    departureDate: Date;
  }): Promise<RouteData> {
    // Generate cache key
    const cacheKey = `fuelsense:route:${params.origin}-${params.destination}-${params.speed}`;

    // Try cache
    try {
      const cachedRaw = await this.cache.get<CachedRouteData>(cacheKey);
      if (cachedRaw) {
        const cached = normalizeCachedRoute(cachedRaw);
        // Adjust timeline dates based on new departure date
        const timeDiff = params.departureDate.getTime() - cached.timeline[0]?.eta.getTime();
        if (timeDiff !== 0) {
          cached.timeline = cached.timeline.map((entry) => ({
            ...entry,
            eta: new Date(entry.eta.getTime() + timeDiff),
          }));
          cached.ecaSegments = cached.ecaSegments.map((segment) => ({
            ...segment,
            startTime: new Date(segment.startTime.getTime() + timeDiff),
            endTime: new Date(segment.endTime.getTime() + timeDiff),
          }));
        }
        console.log(`[CACHE HIT] route:${params.origin}-${params.destination}`);
        return cached;
      }
    } catch (error) {
      console.error('[RouteService] Cache read error:', error);
    }

    // Get port metadata from PortRepository (name, country, fuel_capabilities)
    const originPort = await this.portRepo.findByCode(params.origin);
    const destPort = await this.portRepo.findByCode(params.destination);

    if (!originPort) {
      console.warn(`⚠️ [ROUTE-SERVICE] Origin port ${params.origin} not in database`);
    }
    if (!destPort) {
      console.warn(`⚠️ [ROUTE-SERVICE] Destination port ${params.destination} not in database`);
    }

    // Call SeaRoute API with PORT CODES (API resolves coordinates from its database)
    console.log('📊 [ROUTE-SERVICE] Calculating route:', params.origin, '→', params.destination);
    console.log('🚢 [ROUTE-SERVICE] Sending port codes to SeaRoute API');
    const apiResponse = await this.seaRouteAPI.calculateRoute({
      from: params.origin,
      to: params.destination,
      speed: params.speed,
    });

    console.log('✅ [ROUTE-SERVICE] Route received from API');
    console.log('   Distance:', apiResponse.distance, 'nm');
    console.log('   Duration:', apiResponse.duration, 'hours');

    // Log API geometry format for debugging (first/last only)
    if (apiResponse.geometry.length > 0) {
      const first = apiResponse.geometry[0];
      const last = apiResponse.geometry[apiResponse.geometry.length - 1];
      console.log('📊 [ROUTE-SERVICE] API geometry (GeoJSON [lon, lat]):', {
        count: apiResponse.geometry.length,
        first,
        last,
      });
    }

    // Convert API geometry ([lon, lat]) to waypoints ([lat, lon])
    const waypoints = this.convertGeometryToWaypoints(
      apiResponse.geometry,
      apiResponse.distance
    );

    // Resolve origin/destination coordinates: prefer API-resolved, else port DB, else first/last waypoint
    // API returns from/to in GeoJSON [lon, lat] - same as route geometry; convert to [lat, lon]
    const originCoordsResolved =
      apiResponse.originResolved?.coordinates != null
        ? { lat: apiResponse.originResolved.coordinates[1], lon: apiResponse.originResolved.coordinates[0] }
        : originPort
          ? arrayToObject(originPort.coordinates)
          : waypoints.length > 0
            ? arrayToObject(waypoints[0].coordinates)
            : { lat: 0, lon: 0 };
    const destCoordsResolved =
      apiResponse.destinationResolved?.coordinates != null
        ? { lat: apiResponse.destinationResolved.coordinates[1], lon: apiResponse.destinationResolved.coordinates[0] }
        : destPort
          ? arrayToObject(destPort.coordinates)
          : waypoints.length > 0
            ? arrayToObject(waypoints[waypoints.length - 1].coordinates)
            : { lat: 0, lon: 0 };

    // Validate waypoints are near origin and destination (use resolved coords)
    if (waypoints.length > 0) {
      const firstWp = waypoints[0];
      const lastWp = waypoints[waypoints.length - 1];
      const firstWpCoords = arrayToObject(firstWp.coordinates);
      const lastWpCoords = arrayToObject(lastWp.coordinates);
      const distFromOrigin = haversineDistance(firstWpCoords, originCoordsResolved);
      const distFromDest = haversineDistance(lastWpCoords, destCoordsResolved);

      console.log('🔍 [ROUTE-SERVICE] Waypoint validation:');
      console.log('   Origin (resolved):', originCoordsResolved);
      console.log('   First waypoint:', firstWpCoords);
      console.log('   Distance from origin:', distFromOrigin.toFixed(2), 'nm');
      console.log('   Destination (resolved):', destCoordsResolved);
      console.log('   Last waypoint:', lastWpCoords);
      console.log('   Distance from destination:', distFromDest.toFixed(2), 'nm');

      if (distFromOrigin > 100) {
        console.error('❌ [ROUTE-SERVICE] First waypoint too far from origin!');
        console.error('   Distance:', distFromOrigin.toFixed(2), 'nm');
        throw new Error(
          `Route validation failed: First waypoint is ${distFromOrigin.toFixed(0)}nm from origin. Expected < 100nm.`
        );
      }
      if (distFromDest > 100) {
        console.error('❌ [ROUTE-SERVICE] Last waypoint too far from destination!');
        throw new Error(
          `Route validation failed: Last waypoint is ${distFromDest.toFixed(0)}nm from destination.`
        );
      }
      console.log('✅ [ROUTE-SERVICE] Waypoint validation passed');
    }

    // Enhance with ECA zones
    const enhancedWaypoints = await this.detectECAZones(waypoints);

    // Calculate timeline
    const timeline = this.calculateTimeline(
      enhancedWaypoints,
      params.speed,
      params.departureDate
    );

    // Build ECA segments
    const ecaSegments = this.buildECASegments(enhancedWaypoints, timeline);

    // Determine route type
    const routeType = this.determineRouteType(enhancedWaypoints);

    const routeData: RouteData = {
      origin: {
        port_code: params.origin,
        name: originPort?.name ?? apiResponse.originResolved?.name ?? params.origin,
        country: originPort?.country ?? 'Unknown',
        coordinates: originCoordsResolved,
        fuel_capabilities: (originPort?.fuelsAvailable as any[]) ?? [],
      },
      destination: {
        port_code: params.destination,
        name: destPort?.name ?? apiResponse.destinationResolved?.name ?? params.destination,
        country: destPort?.country ?? 'Unknown',
        coordinates: destCoordsResolved,
        fuel_capabilities: (destPort?.fuelsAvailable as any[]) ?? [],
      },
      waypoints: enhancedWaypoints,
      totalDistanceNm: apiResponse.distance,
      timeline,
      ecaSegments,
      estimatedHours: apiResponse.duration || apiResponse.distance / params.speed,
      routeType,
    };

    // Cache result (1 hour TTL)
    try {
      await this.cache.set(cacheKey, routeData, 3600);
    } catch (error) {
      console.error('[RouteService] Cache write error:', error);
    }

    return routeData;
  }

  /**
   * Convert API geometry to waypoints with distance calculations
   */
  private convertGeometryToWaypoints(
    geometry: [number, number][], // [lon, lat] from API
    totalDistance: number
  ): Waypoint[] {
    // Convert [lon, lat] to [lat, lon] and calculate distances
    const waypoints: Waypoint[] = [];
    let cumulativeDistance = 0;

    for (let i = 0; i < geometry.length; i++) {
      const [lon, lat] = geometry[i];

      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        console.error('❌ [ROUTE-SERVICE] Invalid coordinates in geometry!');
        console.error('   Index:', i);
        console.error('   Raw geometry [lon, lat]:', geometry[i]);
        console.error('   Extracted lat:', lat, 'lon:', lon);
        throw new Error(
          `Invalid coordinates in API geometry at waypoint ${i}: ` +
            `lat=${lat}, lon=${lon}. Valid ranges: lat [-90,90], lon [-180,180]`
        );
      }

      if (i === 0 && Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001) {
        console.error('❌ [ROUTE-SERVICE] First waypoint is at (0, 0)!');
        console.error('   Raw API geometry:', geometry[0]);
        console.error('   This indicates wrong coordinates were sent to API');
        throw new Error(
          'Route calculation failed: First waypoint is at (0, 0). ' +
            'This indicates port coordinates are missing or incorrect.'
        );
      }

      const coords: [number, number] = [lat, lon];

      if (i === 0 || i === geometry.length - 1) {
        console.log(
          `   🔄 Waypoint ${i}: [lon,lat] ${JSON.stringify(geometry[i])} → [lat,lon] ${JSON.stringify(coords)}`
        );
      }

      let distanceFromPrevious = 0;
      if (i > 0) {
        const prevCoords = waypoints[i - 1].coordinates;
        distanceFromPrevious = this.haversineDistance(prevCoords, coords);
        cumulativeDistance += distanceFromPrevious;
      }

      waypoints.push({
        coordinates: coords,
        distanceFromPreviousNm: distanceFromPrevious,
        distanceFromStartNm: cumulativeDistance,
        inECA: false,
      });
    }

    return waypoints;
  }

  /**
   * Detect ECA zones for waypoints
   */
  private async detectECAZones(waypoints: Waypoint[]): Promise<Waypoint[]> {
    // Get active ECA zones
    const activeZones: ECAZone[] = Object.values(ECA_ZONES)
      .filter((zone) => zone.status === 'ACTIVE')
      .map((zone) => ({
        name: zone.name,
        code: zone.code,
        boundaries: zone.boundaries,
      }));

    // Create route line for intersection checks
    const routeLine = turf.lineString(
      waypoints.map((wp) => [wp.coordinates[1], wp.coordinates[0]]) // [lon, lat] for Turf
    );

    return waypoints.map((waypoint) => {
      const point = turf.point([waypoint.coordinates[1], waypoint.coordinates[0]]); // [lon, lat]

      // Check each ECA zone
      for (const zone of activeZones) {
        for (const boundary of zone.boundaries) {
          // Convert boundary to Turf polygon format
          const polygon = turf.polygon([boundary]);

          // Check if point is in polygon
          if (turf.booleanPointInPolygon(point, polygon)) {
            return {
              ...waypoint,
              inECA: true,
              ecaZoneName: zone.name,
            };
          }
        }
      }

      return waypoint;
    });
  }

  /**
   * Calculate timeline for waypoints
   */
  private calculateTimeline(
    waypoints: Waypoint[],
    speed: number,
    startDate: Date
  ): Timeline {
    const timeline: Timeline = [];
    let currentTime = new Date(startDate);

    for (const waypoint of waypoints) {
      if (waypoint.distanceFromPreviousNm > 0) {
        // Calculate time to reach this waypoint
        const hours = waypoint.distanceFromPreviousNm / speed;
        currentTime = new Date(currentTime.getTime() + hours * 60 * 60 * 1000);
      }

      timeline.push({
        waypoint,
        eta: new Date(currentTime),
        distanceFromStartNm: waypoint.distanceFromStartNm,
      });
    }

    return timeline;
  }

  /**
   * Build ECA segments from waypoints
   */
  private buildECASegments(waypoints: Waypoint[], timeline: Timeline): ECASegment[] {
    const segments: ECASegment[] = [];
    let currentSegment: {
      startIndex: number;
      zoneName: string;
    } | null = null;

    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      const timelineEntry = timeline[i];

      if (waypoint.inECA && waypoint.ecaZoneName) {
        if (!currentSegment || currentSegment.zoneName !== waypoint.ecaZoneName) {
          // End previous segment if exists
          if (currentSegment) {
            segments.push({
              startWaypointIndex: currentSegment.startIndex,
              endWaypointIndex: i - 1,
              zoneName: currentSegment.zoneName,
              distanceNm:
                waypoints[i - 1].distanceFromStartNm -
                waypoints[currentSegment.startIndex].distanceFromStartNm,
              startTime: timeline[currentSegment.startIndex].eta,
              endTime: timeline[i - 1].eta,
            });
          }

          // Start new segment
          currentSegment = {
            startIndex: i,
            zoneName: waypoint.ecaZoneName,
          };
        }
      } else {
        // End current segment if exists
        if (currentSegment) {
          segments.push({
            startWaypointIndex: currentSegment.startIndex,
            endWaypointIndex: i - 1,
            zoneName: currentSegment.zoneName,
            distanceNm:
              waypoints[i - 1].distanceFromStartNm -
              waypoints[currentSegment.startIndex].distanceFromStartNm,
            startTime: timeline[currentSegment.startIndex].eta,
            endTime: timeline[i - 1].eta,
          });
          currentSegment = null;
        }
      }
    }

    // Close final segment if exists
    if (currentSegment) {
      const lastIndex = waypoints.length - 1;
      segments.push({
        startWaypointIndex: currentSegment.startIndex,
        endWaypointIndex: lastIndex,
        zoneName: currentSegment.zoneName,
        distanceNm:
          waypoints[lastIndex].distanceFromStartNm -
          waypoints[currentSegment.startIndex].distanceFromStartNm,
        startTime: timeline[currentSegment.startIndex].eta,
        endTime: timeline[lastIndex].eta,
      });
    }

    return segments;
  }

  /**
   * Determine route type based on waypoints
   */
  private determineRouteType(waypoints: Waypoint[]): string {
    // Check for major canal passages
    const suezCanal = { lat: 30.5852, lon: 32.2656 };
    const panamaCanal = { lat: 9.0, lon: -79.5 };

    const nearSuez = waypoints.some(
      (wp) =>
        Math.abs(wp.coordinates[0] - suezCanal.lat) < 2 &&
        Math.abs(wp.coordinates[1] - suezCanal.lon) < 2
    );

    const nearPanama = waypoints.some(
      (wp) =>
        Math.abs(wp.coordinates[0] - panamaCanal.lat) < 2 &&
        Math.abs(wp.coordinates[1] - panamaCanal.lon) < 2
    );

    if (nearSuez) return 'via Suez Canal';
    if (nearPanama) return 'via Panama Canal';

    // Check if route crosses major ocean basins
    const lats = waypoints.map((wp) => wp.coordinates[0]);
    const lons = waypoints.map((wp) => wp.coordinates[1]);
    const latRange = Math.max(...lats) - Math.min(...lats);
    const lonRange = Math.max(...lons) - Math.min(...lons);

    if (latRange > 30 || lonRange > 60) {
      return 'transoceanic route';
    }

    return 'direct route';
  }

  /**
   * Calculate Haversine distance between two coordinates
   */
  private haversineDistance(
    from: [number, number],
    to: [number, number]
  ): number {
    const R = 3440.065; // Earth's radius in nautical miles

    const lat1Rad = (from[0] * Math.PI) / 180;
    const lat2Rad = (to[0] * Math.PI) / 180;
    const deltaLatRad = ((to[0] - from[0]) * Math.PI) / 180;
    const deltaLonRad = ((to[1] - from[1]) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) *
        Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
