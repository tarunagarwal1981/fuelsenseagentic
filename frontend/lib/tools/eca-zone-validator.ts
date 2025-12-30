/**
 * ECA Zone Validator Tool
 * 
 * Validates if a ship's route crosses any Emission Control Areas (ECAs)
 * and calculates MGO fuel requirements for ECA compliance.
 * 
 * ALGORITHM OVERVIEW:
 * 1. Take route waypoints as input
 * 2. For each active ECA zone:
 *    a. Check if route line intersects ECA polygon
 *    b. Find entry and exit points
 *    c. Calculate distance within ECA
 * 3. Calculate time in ECA (distance / speed)
 * 4. Calculate MGO fuel requirement (time × consumption rate)
 * 5. Add safety margin (10%)
 * 6. Generate fuel switching points
 */

import { z } from 'zod';
import * as turf from '@turf/turf';
import { 
  ECA_ZONES, 
  getActiveECAZones, 
  getProposedECAZones,
  CONSUMPTION_CONFIG,
  SAFETY_MARGIN_CONFIG,
  DISTANCE_CONFIG
} from './eca-config';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const ecaZoneValidatorInputSchema = z.object({
  route_waypoints: z.array(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      distance_from_origin_nm: z.number().optional()
    })
  ).min(2, 'At least 2 waypoints required'),
  
  vessel_speed_knots: z.number().positive().default(14),
  
  // Vessel consumption profile (optional - defaults provided)
  vessel_consumption: z.object({
    main_engine_mt_per_day: z.number().positive().default(30),
    auxiliary_mt_per_day: z.number().positive().default(5)
  }).optional()
});

export type ECAZoneValidatorInput = z.infer<typeof ecaZoneValidatorInputSchema>;

// ============================================================================
// OUTPUT INTERFACE
// ============================================================================

export interface ECAZoneCrossing {
  zone_name: string;
  zone_code: string;
  zone_status: 'ACTIVE' | 'PROPOSED';
  sulfur_limit_percent: number;
  
  // Geographic data
  entry_point: { lat: number; lon: number };
  exit_point: { lat: number; lon: number };
  distance_in_zone_nm: number;
  
  // Time calculations
  time_in_zone_hours: number;
  entry_time_from_start_hours: number;
  exit_time_from_start_hours: number;
  
  // Fuel requirements
  required_fuel_type: string; // "MGO" or "LSGO"
  estimated_mgo_consumption_mt: number;
}

export interface FuelSwitchingPoint {
  action: 'SWITCH_TO_MGO' | 'SWITCH_TO_VLSFO';
  location: { lat: number; lon: number };
  time_from_start_hours: number;
  distance_from_origin_nm: number;
  reason: string;
}

export interface ECAZoneValidatorOutput {
  // Summary
  has_eca_zones: boolean;
  total_eca_distance_nm: number;
  total_eca_time_hours: number;
  
  // Detailed crossings
  eca_zones_crossed: ECAZoneCrossing[];
  proposed_zones_crossed: ECAZoneCrossing[];
  
  // Fuel requirements
  fuel_requirements: {
    requires_eca_fuel: boolean;
    total_mgo_required_mt: number;
    mgo_with_safety_margin_mt: number;
    safety_margin_percent: number;
    switching_points: FuelSwitchingPoint[];
  };
  
  // Warnings
  compliance_warnings: string[];
}

// ============================================================================
// MAIN EXECUTION FUNCTION
// ============================================================================

export async function executeECAZoneValidatorTool(
  input: ECAZoneValidatorInput
): Promise<ECAZoneValidatorOutput> {
  
  console.log('🌍 [ECA-VALIDATOR] Starting ECA zone analysis...');
  console.log(`   Route waypoints: ${input.route_waypoints.length}`);
  console.log(`   Vessel speed: ${input.vessel_speed_knots} knots`);
  
  const { route_waypoints, vessel_speed_knots, vessel_consumption } = input;
  
  // Default consumption profile
  const consumptionProfile = vessel_consumption || {
    main_engine_mt_per_day: CONSUMPTION_CONFIG.MAIN_ENGINE_MT_PER_DAY,
    auxiliary_mt_per_day: CONSUMPTION_CONFIG.AUXILIARY_MT_PER_DAY
  };
  
  // Initialize results
  const activeCrossings: ECAZoneCrossing[] = [];
  const proposedCrossings: ECAZoneCrossing[] = [];
  const switchingPoints: FuelSwitchingPoint[] = [];
  const warnings: string[] = [];
  
  // Convert waypoints to Turf LineString
  const routeLine = createRouteLineString(route_waypoints);
  
  // Check active ECA zones
  const activeZones = getActiveECAZones();
  for (const [zoneKey, zone] of Object.entries(activeZones)) {
    console.log(`🔍 [ECA-VALIDATOR] Checking ${zone.name}...`);
    
    const crossing = await checkZoneCrossing(
      zone,
      routeLine,
      route_waypoints,
      vessel_speed_knots,
      consumptionProfile
    );
    
    if (crossing) {
      console.log(`   ✅ Route crosses ${zone.name}`);
      console.log(`      Distance in ECA: ${crossing.distance_in_zone_nm.toFixed(1)} nm`);
      console.log(`      MGO required: ${crossing.estimated_mgo_consumption_mt.toFixed(1)} MT`);
      activeCrossings.push(crossing);
      
      // Add switching points
      switchingPoints.push({
        action: 'SWITCH_TO_MGO',
        location: crossing.entry_point,
        time_from_start_hours: crossing.entry_time_from_start_hours,
        distance_from_origin_nm: calculateDistanceToPoint(route_waypoints, crossing.entry_point),
        reason: `Entering ${zone.name} - switch to MGO (≤${zone.sulfur_limit_percent}% sulfur)`
      });
      
      switchingPoints.push({
        action: 'SWITCH_TO_VLSFO',
        location: crossing.exit_point,
        time_from_start_hours: crossing.exit_time_from_start_hours,
        distance_from_origin_nm: calculateDistanceToPoint(route_waypoints, crossing.exit_point),
        reason: `Exiting ${zone.name} - can switch back to VLSFO`
      });
    }
  }
  
  // Check proposed ECA zones (for warnings)
  const proposedZones = getProposedECAZones();
  for (const [zoneKey, zone] of Object.entries(proposedZones)) {
    const crossing = await checkZoneCrossing(
      zone,
      routeLine,
      route_waypoints,
      vessel_speed_knots,
      consumptionProfile
    );
    
    if (crossing) {
      proposedCrossings.push(crossing);
      warnings.push(
        `Route will cross proposed ECA: ${zone.name} (expected enforcement: ${zone.enacted_date}). ` +
        `Estimated MGO requirement: ${crossing.estimated_mgo_consumption_mt.toFixed(1)} MT when enacted.`
      );
    }
  }
  
  // Calculate totals
  const totalECADistance = activeCrossings.reduce((sum, c) => sum + c.distance_in_zone_nm, 0);
  const totalECATime = activeCrossings.reduce((sum, c) => sum + c.time_in_zone_hours, 0);
  const totalMGORequired = activeCrossings.reduce((sum, c) => sum + c.estimated_mgo_consumption_mt, 0);
  
  // Apply safety margin from config
  const safetyMarginPercent = SAFETY_MARGIN_CONFIG.OVERALL_MGO_MARGIN_PERCENT;
  const mgoWithMargin = totalMGORequired * (1 + safetyMarginPercent / 100);
  
  // Sort switching points by time
  switchingPoints.sort((a, b) => a.time_from_start_hours - b.time_from_start_hours);
  
  // Log summary
  console.log(`\n📊 [ECA-VALIDATOR] Analysis complete:`);
  console.log(`   ECA zones crossed: ${activeCrossings.length}`);
  console.log(`   Total ECA distance: ${totalECADistance.toFixed(1)} nm`);
  console.log(`   Total MGO required: ${totalMGORequired.toFixed(1)} MT`);
  console.log(`   With safety margin: ${mgoWithMargin.toFixed(1)} MT`);
  
  return {
    has_eca_zones: activeCrossings.length > 0,
    total_eca_distance_nm: totalECADistance,
    total_eca_time_hours: totalECATime,
    eca_zones_crossed: activeCrossings,
    proposed_zones_crossed: proposedCrossings,
    fuel_requirements: {
      requires_eca_fuel: activeCrossings.length > 0,
      total_mgo_required_mt: totalMGORequired,
      mgo_with_safety_margin_mt: Math.ceil(mgoWithMargin),
      safety_margin_percent: safetyMarginPercent,
      switching_points: switchingPoints
    },
    compliance_warnings: warnings
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create Turf LineString from waypoints
 */
function createRouteLineString(waypoints: Array<{lat: number, lon: number}>) {
  // Turf uses [lon, lat] format
  const coordinates = waypoints.map(wp => [wp.lon, wp.lat]);
  return turf.lineString(coordinates);
}

/**
 * Check if route crosses an ECA zone
 */
async function checkZoneCrossing(
  zone: typeof ECA_ZONES[keyof typeof ECA_ZONES],
  routeLine: ReturnType<typeof turf.lineString>,
  waypoints: Array<{lat: number, lon: number}>,
  vesselSpeed: number,
  consumptionProfile: { main_engine_mt_per_day: number, auxiliary_mt_per_day: number }
): Promise<ECAZoneCrossing | null> {
  
  try {
    // Create polygon for each boundary
    for (const boundary of zone.boundaries) {
      const polygon = turf.polygon([boundary]);
      
      // Check if route intersects polygon using booleanIntersects (more reliable)
      const routeIntersectsPolygon = turf.booleanIntersects(routeLine, polygon);
      
      // Debug logging
      console.log(`   [DEBUG] ${zone.name}: booleanIntersects=${routeIntersectsPolygon}`);
      
      if (!routeIntersectsPolygon) {
        // Still check waypoints inside even if booleanIntersects is false
        // (sometimes booleanIntersects can miss cases)
      }
      
      // Find intersection points with polygon boundary
      const intersection = turf.lineIntersect(routeLine, polygon);
      
      // Also check if any waypoints are inside the polygon
      let waypointsInside: Array<{lat: number, lon: number, index: number}> = [];
      waypoints.forEach((wp, index) => {
        const point = turf.point([wp.lon, wp.lat]);
        if (turf.booleanPointInPolygon(point, polygon)) {
          waypointsInside.push({...wp, index});
        }
      });
      
      // Debug logging
      if (waypointsInside.length > 0) {
        console.log(`   [DEBUG] ${zone.name}: Found ${waypointsInside.length} waypoints inside polygon`);
      }
      
      const intersectionCount = intersection.features.length;
      if (intersectionCount > 0) {
        console.log(`   [DEBUG] ${zone.name}: Found ${intersectionCount} intersection points`);
      }
      
      // If we have intersection points OR waypoints inside, route crosses the zone
      // Also check if route intersects (even with single point, it might be crossing)
      if (routeIntersectsPolygon || intersection.features.length >= 2 || waypointsInside.length > 0) {
        // Determine entry and exit points
        let entryPoint: number[];
        let exitPoint: number[];
        
        if (intersection.features.length >= 2) {
          // Use intersection points if available
          entryPoint = intersection.features[0].geometry.coordinates;
          exitPoint = intersection.features[intersection.features.length - 1].geometry.coordinates;
        } else if (waypointsInside.length > 0) {
          // Use first and last waypoints inside polygon
          const firstInside = waypointsInside[0];
          const lastInside = waypointsInside[waypointsInside.length - 1];
          entryPoint = [firstInside.lon, firstInside.lat];
          exitPoint = [lastInside.lon, lastInside.lat];
        } else {
          continue; // Can't determine entry/exit
        }
        
        // Calculate distance within zone
        // If we have waypoints inside, calculate distance from those waypoints
        let distanceInZone: number;
        if (waypointsInside.length > 0 && intersection.features.length < 2) {
          // Calculate distance from waypoints inside polygon
          let totalDistance = 0;
          for (let i = 0; i < waypointsInside.length - 1; i++) {
            const from = turf.point([waypointsInside[i].lon, waypointsInside[i].lat]);
            const to = turf.point([waypointsInside[i + 1].lon, waypointsInside[i + 1].lat]);
            const segmentDistanceKm = turf.distance(from, to, { units: 'kilometers' });
            totalDistance += segmentDistanceKm;
          }
          distanceInZone = totalDistance / DISTANCE_CONFIG.KM_PER_NAUTICAL_MILE;
        } else {
          // Use intersection points
          distanceInZone = calculateDistanceWithinZone(
            routeLine,
            polygon,
            entryPoint,
            exitPoint
          );
        }
        
        // Calculate time in zone
        const timeInZoneHours = distanceInZone / vesselSpeed;
        const timeInZoneDays = timeInZoneHours / 24;
        
        // Calculate MGO consumption
        const mgoConsumption = 
          (consumptionProfile.main_engine_mt_per_day * timeInZoneDays) +
          (consumptionProfile.auxiliary_mt_per_day * timeInZoneDays);
        
        // Calculate entry/exit times from route start
        const entryTime = calculateTimeToPoint(waypoints, 
          { lat: entryPoint[1], lon: entryPoint[0] }, 
          vesselSpeed
        );
        const exitTime = entryTime + timeInZoneHours;
        
        return {
          zone_name: zone.name,
          zone_code: zone.code,
          zone_status: zone.status,
          sulfur_limit_percent: zone.sulfur_limit_percent,
          entry_point: { lat: entryPoint[1], lon: entryPoint[0] },
          exit_point: { lat: exitPoint[1], lon: exitPoint[0] },
          distance_in_zone_nm: distanceInZone,
          time_in_zone_hours: timeInZoneHours,
          entry_time_from_start_hours: entryTime,
          exit_time_from_start_hours: exitTime,
          required_fuel_type: 'MGO',
          estimated_mgo_consumption_mt: mgoConsumption
        };
      }
    }
    
    return null; // No crossing found
    
  } catch (error) {
    console.error(`❌ [ECA-VALIDATOR] Error checking ${zone.name}:`, error);
    return null;
  }
}

/**
 * Calculate distance traveled within ECA zone
 * 
 * ALGORITHM:
 * 1. Get all waypoints between entry and exit points
 * 2. Clip route line to polygon
 * 3. Calculate length of clipped line
 */
function calculateDistanceWithinZone(
  routeLine: ReturnType<typeof turf.lineString>,
  polygon: ReturnType<typeof turf.polygon>,
  entryPoint: number[],
  exitPoint: number[]
): number {
  try {
    // Use turf.lineSlice to get the portion of route within zone
    const slicedLine = turf.lineSlice(
      turf.point(entryPoint),
      turf.point(exitPoint),
      routeLine
    );
    
    // Calculate length in kilometers
    const distanceKm = turf.length(slicedLine, { units: 'kilometers' });
    
    // Convert to nautical miles using config constant
    const distanceNm = distanceKm / DISTANCE_CONFIG.KM_PER_NAUTICAL_MILE;
    
    return distanceNm;
    
  } catch (error) {
    console.error('❌ [ECA-VALIDATOR] Error calculating distance within zone:', error);
    // Fallback: calculate straight-line distance
    const distanceKm = turf.distance(
      turf.point(entryPoint),
      turf.point(exitPoint),
      { units: 'kilometers' }
    );
    return distanceKm / DISTANCE_CONFIG.KM_PER_NAUTICAL_MILE;
  }
}

/**
 * Calculate cumulative time to reach a specific point on route
 * 
 * ALGORITHM:
 * 1. Calculate cumulative distance to point
 * 2. Divide by vessel speed to get time
 */
function calculateTimeToPoint(
  waypoints: Array<{lat: number, lon: number}>,
  targetPoint: {lat: number, lon: number},
  vesselSpeed: number
): number {
  
  const distance = calculateDistanceToPoint(waypoints, targetPoint);
  return distance / vesselSpeed;
}

/**
 * Calculate cumulative distance to a point along the route
 */
function calculateDistanceToPoint(
  waypoints: Array<{lat: number, lon: number}>,
  targetPoint: {lat: number, lon: number}
): number {
  
  // Create line from waypoints
  const routeLine = createRouteLineString(waypoints);
  
  // Find nearest point on line to target
  const target = turf.point([targetPoint.lon, targetPoint.lat]);
  const nearestPoint = turf.nearestPointOnLine(routeLine, target);
  
  // Get cumulative distance to nearest point
  // Calculate distance from route start to this point
  let cumulativeDistance = 0;
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = turf.point([waypoints[i].lon, waypoints[i].lat]);
    const to = turf.point([waypoints[i + 1].lon, waypoints[i + 1].lat]);
    
    // Check if nearest point is between these two waypoints
    const segmentLine = turf.lineString([[waypoints[i].lon, waypoints[i].lat], [waypoints[i + 1].lon, waypoints[i + 1].lat]]);
    const nearestOnSegment = turf.nearestPointOnLine(segmentLine, target);
    
    if (nearestOnSegment.properties.index === 0) {
      // Point is on this segment
      const distanceToNearestKm = turf.distance(from, nearestPoint, { units: 'kilometers' });
      cumulativeDistance += distanceToNearestKm / 1.852; // Convert to nm
      break;
    } else {
      // Point is further along - add full segment
      const segmentDistanceKm = turf.distance(from, to, { units: 'kilometers' });
      cumulativeDistance += segmentDistanceKm / 1.852;
    }
  }
  
  return cumulativeDistance;
}

