/**
 * Bunker Service
 * 
 * Provides bunker port finding and analysis functionality.
 * Consolidates business logic from find-bunker-ports.ts and analyze-bunker-options.ts.
 */

import { PortRepository } from '@/lib/repositories/port-repository';
import { PriceRepository } from '@/lib/repositories/price-repository';
import { RouteService } from './route.service';
import type { RouteData } from './types';
import { RedisCache } from '@/lib/repositories/cache-client';
import { Port } from '@/lib/repositories/types';
import { BunkerPort, BunkerOption, BunkerAnalysis } from './types';

export class BunkerService {
  constructor(
    private portRepo: PortRepository,
    private priceRepo: PriceRepository,
    private routeService: RouteService,
    private cache: RedisCache
  ) {}

  /**
   * Find bunker ports near a route
   */
  async findBunkerPorts(params: {
    route: RouteData;
    maxDeviation: number; // nautical miles
    fuelTypes: string[];
  }): Promise<BunkerPort[]> {
    // Get all bunker-capable ports
    const allPorts = await this.portRepo.findBunkerPorts();

    // Calculate deviation from route for each port
    const portsWithDeviation = allPorts.map((port) => ({
      ...port,
      deviation: this.calculateDeviation(port, params.route),
    }));

    // Filter by max deviation
    const nearbyPorts = portsWithDeviation.filter(
      (p) => p.deviation <= params.maxDeviation
    );

    // Filter by fuel availability
    const bunkerPorts = nearbyPorts.filter((port) =>
      params.fuelTypes.some((fuel) => port.fuelsAvailable.includes(fuel))
    );

    // Sort by deviation (closest first)
    return bunkerPorts.sort((a, b) => a.deviation - b.deviation);
  }

  /**
   * Analyze bunker options and rank by total cost
   */
  async analyzeBunkerOptions(params: {
    ports: BunkerPort[];
    requiredFuel: number; // MT
    currentROB: number; // MT
    fuelType: string;
  }): Promise<BunkerAnalysis> {
    const options: BunkerOption[] = [];

    for (const port of params.ports) {
      // Get current prices
      const prices = await this.priceRepo.getLatestPrices({
        portCode: port.code,
        fuelTypes: [params.fuelType],
      });

      const price = prices[params.fuelType];
      if (!price) {
        // Skip ports without price data
        continue;
      }

      // Calculate total cost including deviation penalty
      const bunkerCost = price * params.requiredFuel;
      const deviationCost = this.calculateDeviationCost(
        port.deviation,
        params.requiredFuel
      );

      options.push({
        port,
        fuelType: params.fuelType,
        pricePerMT: price,
        quantity: params.requiredFuel,
        bunkerCost,
        deviationCost,
        totalCost: bunkerCost + deviationCost,
      });
    }

    // Sort by total cost
    options.sort((a, b) => a.totalCost - b.totalCost);

    // Calculate savings (vs next best option)
    const savings =
      options.length > 1 ? options[1].totalCost - options[0].totalCost : 0;

    return {
      options,
      recommended: options.length > 0 ? options[0] : null,
      savings,
    };
  }

  /**
   * Calculate deviation from route for a port
   * Finds the minimum distance from port to any route segment
   */
  private calculateDeviation(port: Port, route: RouteData): number {
    let minDistance = Infinity;

    // Check distance to each route segment
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const segmentStart = route.waypoints[i].coordinates;
      const segmentEnd = route.waypoints[i + 1].coordinates;

      const distance = this.distanceToSegment(
        port.coordinates,
        segmentStart,
        segmentEnd
      );

      minDistance = Math.min(minDistance, distance);
    }

    // Also check distance to waypoints (in case port is very close to a waypoint)
    for (const waypoint of route.waypoints) {
      const distance = this.haversineDistance(
        port.coordinates,
        waypoint.coordinates
      );
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  /**
   * Calculate distance from a point to a line segment
   * Uses perpendicular distance if point projects onto segment,
   * otherwise uses distance to nearest endpoint
   */
  private distanceToSegment(
    point: [number, number], // [lat, lon]
    segmentStart: [number, number], // [lat, lon]
    segmentEnd: [number, number] // [lat, lon]
  ): number {
    // Convert to radians for calculations
    const pointLat = (point[0] * Math.PI) / 180;
    const pointLon = (point[1] * Math.PI) / 180;
    const startLat = (segmentStart[0] * Math.PI) / 180;
    const startLon = (segmentStart[1] * Math.PI) / 180;
    const endLat = (segmentEnd[0] * Math.PI) / 180;
    const endLon = (segmentEnd[1] * Math.PI) / 180;

    // Calculate vector from start to end
    const dx = endLon - startLon;
    const dy = endLat - startLat;
    const segmentLengthSq = dx * dx + dy * dy;

    if (segmentLengthSq === 0) {
      // Segment is a point, return distance to that point
      return this.haversineDistance(point, segmentStart);
    }

    // Calculate projection parameter t
    // t = dot product of (point - start) and (end - start) / segmentLengthSq
    const pointDx = pointLon - startLon;
    const pointDy = pointLat - startLat;
    const t = Math.max(0, Math.min(1, (pointDx * dx + pointDy * dy) / segmentLengthSq));

    // Find closest point on segment
    const closestLat = startLat + t * dy;
    const closestLon = startLon + t * dx;

    // Convert back to degrees and calculate distance
    const closestPoint: [number, number] = [
      (closestLat * 180) / Math.PI,
      (closestLon * 180) / Math.PI,
    ];

    return this.haversineDistance(point, closestPoint);
  }

  /**
   * Calculate deviation cost penalty
   * Deviation cost = extra distance × fuel consumption × fuel price
   */
  private calculateDeviationCost(
    deviationNm: number,
    fuelQuantity: number
  ): number {
    // Round trip deviation (go to port and return to route)
    const roundTripDeviation = deviationNm * 2;

    // Approximate fuel consumption: 1 NM deviation costs ~0.5 MT fuel
    // This is a simplified model - actual consumption depends on vessel speed and type
    const extraFuelMT = roundTripDeviation * 0.5;

    // Use approximate VLSFO price (can be enhanced to use actual price)
    const fuelPrice = 650; // USD per MT (approximate)

    return extraFuelMT * fuelPrice;
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
