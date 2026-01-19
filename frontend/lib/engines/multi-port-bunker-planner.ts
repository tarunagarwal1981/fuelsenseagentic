/**
 * Multi-Port Bunker Planner Engine
 * 
 * Plans multi-stop bunkering strategies when voyage fuel consumption
 * exceeds vessel capacity (single stop is insufficient).
 * 
 * Phase 1 Constraints:
 * - Maximum 2 bunker stops (departure + 1 mid-voyage port)
 * - Mid-voyage port must be within 100nm of route
 * - Only considers ports with available pricing data
 * 
 * Algorithm:
 * 1. Detect if multi-port is needed (consumption > capacity)
 * 2. Find departure port (closest to origin)
 * 3. Find mid-voyage ports (30-80% along route, within 100nm)
 * 4. For each mid-voyage candidate, calculate 2-stop plan
 * 5. Validate ROB at all checkpoints (departure, mid-voyage arrival, mid-voyage departure, destination)
 * 6. Rank valid plans by total cost
 * 7. Return top 3 options
 */

import type { RouteData, FuelQuantityMT, MultiBunkerStop, MultiBunkerPlan, MultiBunkerAnalysis } from '../multi-agent/state';
import type { FoundPort } from '../tools/port-finder';
import type { PriceFetcherOutput } from '../tools/price-fetcher';
import type { VesselProfile } from '../services/vessel-service';
import type { FuelQuantity, ROBTrackingInput } from './rob-tracking-engine';
import { ROBTrackingEngine } from './rob-tracking-engine';

// ============================================================================
// Configuration Constants
// ============================================================================

/** Minimum route progress for mid-voyage port (30%) */
const MIN_MIDPOINT_PROGRESS = 0.30;

/** Maximum route progress for mid-voyage port (80%) */
const MAX_MIDPOINT_PROGRESS = 0.80;

/** Maximum deviation for mid-voyage port in nautical miles */
const MAX_MIDPOINT_DEVIATION_NM = 100;

/** Default safety margin in days */
const DEFAULT_SAFETY_MARGIN_DAYS = 3;

/** Default vessel speed in knots (for time calculations) */
const DEFAULT_VESSEL_SPEED_KNOTS = 14;

// ============================================================================
// Input/Output Types
// ============================================================================

export interface MultiPortPlannerInput {
  /** Route data with waypoints and distance */
  route_data: RouteData;
  
  /** Vessel profile with capacity, consumption, ROB */
  vessel_profile: VesselProfile;
  
  /** Total voyage consumption (weather-adjusted if available) */
  voyage_consumption: FuelQuantityMT;
  
  /** Candidate bunker ports along route */
  candidate_ports: FoundPort[];
  
  /** Port pricing data */
  port_prices: PriceFetcherOutput;
  
  /** Weather consumption adjustment factor (default: 1.0) */
  weather_factor?: number;
  
  /** Safety margin in days (default: 3) */
  safety_margin_days?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get price for a port and fuel type
 * 
 * PriceFetcherOutput structure:
 * - prices_by_port: Record<port_code, PriceData[]>
 * - PriceData: { price: FuelPrice, is_fresh, ... }
 * - FuelPrice: { fuel_type, price_per_mt, ... }
 */
function getPortPrice(
  port_code: string,
  fuel_type: 'VLSFO' | 'LSMGO',
  prices: PriceFetcherOutput
): number | null {
  const portPrices = prices.prices_by_port?.[port_code];
  if (!portPrices || portPrices.length === 0) return null;
  
  // PriceData has a nested `price` field with FuelPrice
  const priceData = portPrices.find(p => p.price?.fuel_type === fuel_type);
  return priceData?.price?.price_per_mt ?? null;
}

/**
 * Calculate route progress (0-1) for a waypoint index
 */
function calculateRouteProgress(
  waypointIndex: number,
  totalWaypoints: number
): number {
  if (totalWaypoints <= 1) return 0;
  return waypointIndex / (totalWaypoints - 1);
}

/**
 * Calculate distance along route for a waypoint index
 * Approximation based on linear interpolation
 */
function calculateDistanceAlongRoute(
  waypointIndex: number,
  totalWaypoints: number,
  totalDistance: number
): number {
  const progress = calculateRouteProgress(waypointIndex, totalWaypoints);
  return progress * totalDistance;
}

/**
 * Calculate travel time in days
 */
function calculateTravelDays(
  distance_nm: number,
  speed_knots: number = DEFAULT_VESSEL_SPEED_KNOTS
): number {
  return distance_nm / (speed_knots * 24);
}

/**
 * Find the best departure port (closest to origin)
 */
function findDeparturePort(
  candidatePorts: FoundPort[],
  routeData: RouteData,
  prices: PriceFetcherOutput
): FoundPort | null {
  const totalWaypoints = routeData.waypoints.length;
  
  // Filter ports near the start of route (first 20%)
  const departureCandidates = candidatePorts.filter(port => {
    const progress = calculateRouteProgress(port.nearest_waypoint_index, totalWaypoints);
    // Within first 20% of route, AND has pricing
    return progress <= 0.20 && getPortPrice(port.port.port_code, 'VLSFO', prices) !== null;
  });
  
  if (departureCandidates.length === 0) {
    // Fallback: use any port with pricing within 100nm deviation
    const fallback = candidatePorts.find(port => 
      port.distance_from_route_nm < 100 && 
      getPortPrice(port.port.port_code, 'VLSFO', prices) !== null
    );
    return fallback || null;
  }
  
  // Sort by distance from route (prefer closer ports)
  departureCandidates.sort((a, b) => a.distance_from_route_nm - b.distance_from_route_nm);
  
  return departureCandidates[0];
}

/**
 * Find valid mid-voyage ports (30-80% along route, within 100nm, with pricing)
 */
function findMidVoyagePorts(
  candidatePorts: FoundPort[],
  routeData: RouteData,
  prices: PriceFetcherOutput,
  departurePortCode?: string
): FoundPort[] {
  const totalWaypoints = routeData.waypoints.length;
  
  const midVoyagePorts = candidatePorts.filter(port => {
    const progress = calculateRouteProgress(port.nearest_waypoint_index, totalWaypoints);
    
    // Must be in mid-voyage range (30-80% of route)
    if (progress < MIN_MIDPOINT_PROGRESS || progress > MAX_MIDPOINT_PROGRESS) {
      return false;
    }
    
    // Must be within 100nm of route
    if (port.distance_from_route_nm > MAX_MIDPOINT_DEVIATION_NM) {
      return false;
    }
    
    // Must have VLSFO pricing
    if (getPortPrice(port.port.port_code, 'VLSFO', prices) === null) {
      return false;
    }
    
    // Must not be the same as departure port
    if (departurePortCode && port.port.port_code === departurePortCode) {
      return false;
    }
    
    return true;
  });
  
  // Sort by route progress (prefer ports closer to middle of route)
  midVoyagePorts.sort((a, b) => {
    const progressA = calculateRouteProgress(a.nearest_waypoint_index, totalWaypoints);
    const progressB = calculateRouteProgress(b.nearest_waypoint_index, totalWaypoints);
    // Prefer ports closer to 50% mark
    return Math.abs(progressA - 0.5) - Math.abs(progressB - 0.5);
  });
  
  return midVoyagePorts;
}

/**
 * Calculate a 2-stop bunker plan for given departure and mid-voyage ports
 */
function calculate2StopPlan(
  departurePort: FoundPort,
  midVoyagePort: FoundPort,
  input: MultiPortPlannerInput
): MultiBunkerPlan | null {
  const { route_data, vessel_profile, voyage_consumption, port_prices, safety_margin_days = DEFAULT_SAFETY_MARGIN_DAYS } = input;
  
  const vp = vessel_profile;
  const totalDistance = route_data.distance_nm;
  const totalWaypoints = route_data.waypoints.length;
  
  // Get port positions on route
  const departureProgress = calculateRouteProgress(departurePort.nearest_waypoint_index, totalWaypoints);
  const midVoyageProgress = calculateRouteProgress(midVoyagePort.nearest_waypoint_index, totalWaypoints);
  
  const departureDistanceNm = calculateDistanceAlongRoute(departurePort.nearest_waypoint_index, totalWaypoints, totalDistance);
  const midVoyageDistanceNm = calculateDistanceAlongRoute(midVoyagePort.nearest_waypoint_index, totalWaypoints, totalDistance);
  
  // Calculate segment distances
  const distanceToMidVoyage = midVoyageDistanceNm - departureDistanceNm + departurePort.distance_from_route_nm + midVoyagePort.distance_from_route_nm;
  const distanceFromMidVoyageToDestination = totalDistance - midVoyageDistanceNm + midVoyagePort.distance_from_route_nm;
  
  // Calculate travel times
  const daysToMidVoyage = calculateTravelDays(distanceToMidVoyage);
  const daysToDestination = calculateTravelDays(distanceFromMidVoyageToDestination);
  const totalDays = daysToMidVoyage + daysToDestination;
  
  // Calculate consumption rates per day (apply weather factor if provided)
  const weatherFactor = input.weather_factor ?? 1.0;
  const dailyVlsfo = (voyage_consumption.VLSFO / totalDays) * weatherFactor;
  const dailyLsmgo = (voyage_consumption.LSMGO / totalDays) * weatherFactor;
  
  // Calculate segment consumption
  const consumptionToMidVoyage: FuelQuantityMT = {
    VLSFO: dailyVlsfo * daysToMidVoyage,
    LSMGO: dailyLsmgo * daysToMidVoyage,
  };
  
  const consumptionToDestination: FuelQuantityMT = {
    VLSFO: dailyVlsfo * daysToDestination,
    LSMGO: dailyLsmgo * daysToDestination,
  };
  
  // Get fuel prices
  const departurePriceVlsfo = getPortPrice(departurePort.port.port_code, 'VLSFO', port_prices) ?? 600;
  const departurePriceLsmgo = getPortPrice(departurePort.port.port_code, 'LSMGO', port_prices) ?? departurePriceVlsfo * 1.4;
  const midVoyagePriceVlsfo = getPortPrice(midVoyagePort.port.port_code, 'VLSFO', port_prices) ?? 600;
  const midVoyagePriceLsmgo = getPortPrice(midVoyagePort.port.port_code, 'LSMGO', port_prices) ?? midVoyagePriceVlsfo * 1.4;
  
  // Safety margin buffer (3 days of fuel)
  const safetyBufferVlsfo = dailyVlsfo * safety_margin_days;
  const safetyBufferLsmgo = dailyLsmgo * safety_margin_days;
  
  // === STOP 1: Departure - Fill to capacity ===
  const initialRob = vp.initial_rob;
  const capacity = vp.capacity;
  
  // Calculate how much we can bunker at departure (fill to capacity)
  const departureBunkerVlsfo = Math.max(0, capacity.VLSFO - initialRob.VLSFO);
  const departureBunkerLsmgo = Math.max(0, capacity.LSMGO - initialRob.LSMGO);
  
  const departureAfterBunker: FuelQuantityMT = {
    VLSFO: initialRob.VLSFO + departureBunkerVlsfo,
    LSMGO: initialRob.LSMGO + departureBunkerLsmgo,
  };
  
  // ROB when arriving at mid-voyage port
  const arrivalAtMidVoyage: FuelQuantityMT = {
    VLSFO: departureAfterBunker.VLSFO - consumptionToMidVoyage.VLSFO,
    LSMGO: departureAfterBunker.LSMGO - consumptionToMidVoyage.LSMGO,
  };
  
  // Validation checkpoint 1: Can we reach mid-voyage port?
  if (arrivalAtMidVoyage.VLSFO < safetyBufferVlsfo || arrivalAtMidVoyage.LSMGO < safetyBufferLsmgo) {
    // Cannot safely reach mid-voyage port even at full capacity
    console.log(`⚠️ [MULTI-PORT] Cannot reach ${midVoyagePort.port.name}: arrival ROB would be ${arrivalAtMidVoyage.VLSFO.toFixed(0)} VLSFO, ${arrivalAtMidVoyage.LSMGO.toFixed(0)} LSMGO`);
    return null;
  }
  
  // === STOP 2: Mid-Voyage - Calculate required bunker quantity ===
  // Need enough fuel to reach destination with safety margin
  const fuelNeededToDestination: FuelQuantityMT = {
    VLSFO: consumptionToDestination.VLSFO + safetyBufferVlsfo,
    LSMGO: consumptionToDestination.LSMGO + safetyBufferLsmgo,
  };
  
  // How much to bunker at mid-voyage
  const midVoyageBunkerVlsfo = Math.max(0, Math.min(
    fuelNeededToDestination.VLSFO - arrivalAtMidVoyage.VLSFO,
    capacity.VLSFO - arrivalAtMidVoyage.VLSFO  // Don't exceed capacity
  ));
  const midVoyageBunkerLsmgo = Math.max(0, Math.min(
    fuelNeededToDestination.LSMGO - arrivalAtMidVoyage.LSMGO,
    capacity.LSMGO - arrivalAtMidVoyage.LSMGO  // Don't exceed capacity
  ));
  
  const midVoyageAfterBunker: FuelQuantityMT = {
    VLSFO: arrivalAtMidVoyage.VLSFO + midVoyageBunkerVlsfo,
    LSMGO: arrivalAtMidVoyage.LSMGO + midVoyageBunkerLsmgo,
  };
  
  // Final ROB at destination
  const finalRob: FuelQuantityMT = {
    VLSFO: midVoyageAfterBunker.VLSFO - consumptionToDestination.VLSFO,
    LSMGO: midVoyageAfterBunker.LSMGO - consumptionToDestination.LSMGO,
  };
  
  // Validation checkpoint 2: Is final ROB safe?
  const isSafe = finalRob.VLSFO >= safetyBufferVlsfo && finalRob.LSMGO >= safetyBufferLsmgo;
  
  // === Calculate costs ===
  const departureFuelCost = (departureBunkerVlsfo * departurePriceVlsfo) + (departureBunkerLsmgo * departurePriceLsmgo);
  const midVoyageFuelCost = (midVoyageBunkerVlsfo * midVoyagePriceVlsfo) + (midVoyageBunkerLsmgo * midVoyagePriceLsmgo);
  
  // Deviation cost (fuel consumed during deviation)
  const deviationConsumptionMt = (departurePort.distance_from_route_nm + midVoyagePort.distance_from_route_nm) / (DEFAULT_VESSEL_SPEED_KNOTS * 24) * dailyVlsfo;
  const deviationCost = deviationConsumptionMt * ((departurePriceVlsfo + midVoyagePriceVlsfo) / 2);
  
  const totalCost = departureFuelCost + midVoyageFuelCost + deviationCost;
  
  // Build the plan
  const stops: MultiBunkerStop[] = [
    {
      port_code: departurePort.port.port_code,
      port_name: departurePort.port.name,
      position_on_route: 'departure',
      segment_index: -1,
      distance_along_route_nm: departureDistanceNm,
      deviation_nm: departurePort.distance_from_route_nm,
      bunker_quantity: { VLSFO: departureBunkerVlsfo, LSMGO: departureBunkerLsmgo },
      arrival_rob: { VLSFO: initialRob.VLSFO, LSMGO: initialRob.LSMGO },
      departure_rob: departureAfterBunker,
      estimated_cost_usd: departureFuelCost,
      fuel_prices: { VLSFO: departurePriceVlsfo, LSMGO: departurePriceLsmgo },
    },
    {
      port_code: midVoyagePort.port.port_code,
      port_name: midVoyagePort.port.name,
      position_on_route: 'midpoint',
      segment_index: Math.floor(midVoyageProgress * (totalWaypoints - 1)),
      distance_along_route_nm: midVoyageDistanceNm,
      deviation_nm: midVoyagePort.distance_from_route_nm,
      bunker_quantity: { VLSFO: midVoyageBunkerVlsfo, LSMGO: midVoyageBunkerLsmgo },
      arrival_rob: arrivalAtMidVoyage,
      departure_rob: midVoyageAfterBunker,
      estimated_cost_usd: midVoyageFuelCost,
      fuel_prices: { VLSFO: midVoyagePriceVlsfo, LSMGO: midVoyagePriceLsmgo },
    },
  ];
  
  return {
    stops,
    total_cost_usd: totalCost,
    final_rob: finalRob,
    is_safe: isSafe,
    rank: 0, // Will be set after ranking
    limitation_note: 'Only 2-stop solutions evaluated in Phase 1',
  };
}

// ============================================================================
// Main Planner Function
// ============================================================================

/**
 * Plan multi-port bunkering strategy
 * 
 * @param input - Planner input with route, vessel, ports, and prices
 * @returns Multi-port bunker analysis with ranked plans
 */
export function planMultiPortBunker(input: MultiPortPlannerInput): MultiBunkerAnalysis {
  console.log('\n🔀 [MULTI-PORT-PLANNER] Starting multi-port planning...');
  
  const { route_data, vessel_profile, voyage_consumption, candidate_ports, port_prices, safety_margin_days = DEFAULT_SAFETY_MARGIN_DAYS } = input;
  
  // 1. Check if multi-port is needed
  const totalConsumption = voyage_consumption.VLSFO + voyage_consumption.LSMGO;
  const totalCapacity = vessel_profile.capacity.VLSFO + vessel_profile.capacity.LSMGO;
  const initialRob = vessel_profile.initial_rob.VLSFO + vessel_profile.initial_rob.LSMGO;
  const availableFuel = initialRob + totalCapacity;
  
  // Calculate safety buffer needed
  const totalDays = route_data.estimated_hours / 24;
  const dailyConsumption = totalConsumption / totalDays;
  const safetyBuffer = dailyConsumption * safety_margin_days;
  
  // Need multi-port if: consumption + safety > initial ROB + what we can add in one stop
  const singleStopMaxFuel = initialRob + (totalCapacity - initialRob); // Fill to capacity
  const needsMultiPort = (totalConsumption + safetyBuffer) > singleStopMaxFuel;
  
  if (!needsMultiPort) {
    console.log('✅ [MULTI-PORT-PLANNER] Single bunker stop is sufficient');
    return {
      required: false,
      plans: [],
    };
  }
  
  const shortfall: FuelQuantityMT = {
    VLSFO: Math.max(0, voyage_consumption.VLSFO - vessel_profile.capacity.VLSFO),
    LSMGO: Math.max(0, voyage_consumption.LSMGO - vessel_profile.capacity.LSMGO),
  };
  
  console.log('⚠️ [MULTI-PORT-PLANNER] Multi-port bunkering required!');
  console.log(`   Voyage consumption: ${voyage_consumption.VLSFO.toFixed(0)} MT VLSFO, ${voyage_consumption.LSMGO.toFixed(0)} MT LSMGO`);
  console.log(`   Vessel capacity: ${vessel_profile.capacity.VLSFO.toFixed(0)} MT VLSFO, ${vessel_profile.capacity.LSMGO.toFixed(0)} MT LSMGO`);
  console.log(`   Initial ROB: ${vessel_profile.initial_rob.VLSFO.toFixed(0)} MT VLSFO, ${vessel_profile.initial_rob.LSMGO.toFixed(0)} MT LSMGO`);
  console.log(`   Shortfall: ${shortfall.VLSFO.toFixed(0)} MT VLSFO, ${shortfall.LSMGO.toFixed(0)} MT LSMGO`);
  
  // 2. Find departure port
  const departurePort = findDeparturePort(candidate_ports, route_data, port_prices);
  
  if (!departurePort) {
    console.log('❌ [MULTI-PORT-PLANNER] No valid departure port found');
    return {
      required: true,
      reason: `Voyage requires ${totalConsumption.toFixed(0)} MT but capacity is ${totalCapacity.toFixed(0)} MT`,
      capacity_constraint: {
        voyage_consumption_mt: voyage_consumption,
        vessel_capacity_mt: vessel_profile.capacity,
        shortfall_mt: shortfall,
      },
      plans: [],
      error_message: 'No departure port with pricing found. Contact operations team.',
    };
  }
  
  console.log(`✅ [MULTI-PORT-PLANNER] Departure port: ${departurePort.port.name}`);
  
  // 3. Find mid-voyage ports
  const midVoyagePorts = findMidVoyagePorts(candidate_ports, route_data, port_prices, departurePort.port.port_code);
  
  console.log(`📍 [MULTI-PORT-PLANNER] Found ${midVoyagePorts.length} mid-voyage port candidates`);
  
  if (midVoyagePorts.length === 0) {
    console.log('❌ [MULTI-PORT-PLANNER] No valid mid-voyage ports found within 100nm of route');
    return {
      required: true,
      reason: `Voyage requires ${totalConsumption.toFixed(0)} MT but capacity is ${totalCapacity.toFixed(0)} MT`,
      capacity_constraint: {
        voyage_consumption_mt: voyage_consumption,
        vessel_capacity_mt: vessel_profile.capacity,
        shortfall_mt: shortfall,
      },
      plans: [],
      error_message: 'No mid-voyage bunker ports found within 100nm of route with pricing. This voyage may require 3+ stops or route modification. Contact operations team.',
    };
  }
  
  // 4. Calculate 2-stop plans for each mid-voyage candidate
  const validPlans: MultiBunkerPlan[] = [];
  
  for (const midPort of midVoyagePorts) {
    const plan = calculate2StopPlan(departurePort, midPort, input);
    
    if (plan && plan.is_safe) {
      validPlans.push(plan);
      console.log(`   ✅ ${midPort.port.name}: $${plan.total_cost_usd.toLocaleString()} (safe)`);
    } else if (plan) {
      console.log(`   ⚠️ ${midPort.port.name}: Plan calculated but unsafe`);
    }
  }
  
  if (validPlans.length === 0) {
    console.log('❌ [MULTI-PORT-PLANNER] No safe 2-stop plans found');
    return {
      required: true,
      reason: `Voyage requires ${totalConsumption.toFixed(0)} MT but capacity is ${totalCapacity.toFixed(0)} MT`,
      capacity_constraint: {
        voyage_consumption_mt: voyage_consumption,
        vessel_capacity_mt: vessel_profile.capacity,
        shortfall_mt: shortfall,
      },
      plans: [],
      error_message: 'No safe 2-stop bunker plans found. This voyage may require 3+ stops or route modification. Contact operations team.',
    };
  }
  
  // 5. Rank by total cost
  validPlans.sort((a, b) => a.total_cost_usd - b.total_cost_usd);
  
  // Set ranks and calculate savings
  const worstCost = validPlans[validPlans.length - 1].total_cost_usd;
  validPlans.forEach((plan, index) => {
    plan.rank = index + 1;
    plan.savings_vs_worst = worstCost - plan.total_cost_usd;
  });
  
  // 6. Return top 3
  const topPlans = validPlans.slice(0, 3);
  
  console.log(`\n🏆 [MULTI-PORT-PLANNER] Best option: ${topPlans[0].stops[0].port_name} → ${topPlans[0].stops[1].port_name}`);
  console.log(`   Total cost: $${topPlans[0].total_cost_usd.toLocaleString()}`);
  console.log(`   Final ROB: ${topPlans[0].final_rob.VLSFO.toFixed(0)} MT VLSFO, ${topPlans[0].final_rob.LSMGO.toFixed(0)} MT LSMGO`);
  
  return {
    required: true,
    reason: `Voyage requires ${totalConsumption.toFixed(0)} MT but single-stop capacity is ${singleStopMaxFuel.toFixed(0)} MT`,
    capacity_constraint: {
      voyage_consumption_mt: voyage_consumption,
      vessel_capacity_mt: vessel_profile.capacity,
      shortfall_mt: shortfall,
    },
    plans: topPlans,
    best_plan: topPlans[0],
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Check if multi-port bunkering is needed (quick check without full planning)
 * 
 * Use this for early detection before running full analysis
 */
export function needsMultiPortBunkering(
  voyageConsumption: FuelQuantityMT,
  vesselCapacity: FuelQuantityMT,
  initialRob: FuelQuantityMT,
  safetyMarginDays: number = DEFAULT_SAFETY_MARGIN_DAYS,
  voyageDays: number = 14
): boolean {
  const totalConsumption = voyageConsumption.VLSFO + voyageConsumption.LSMGO;
  const maxSingleStop = vesselCapacity.VLSFO + vesselCapacity.LSMGO;
  
  // Safety buffer
  const dailyConsumption = totalConsumption / voyageDays;
  const safetyBuffer = dailyConsumption * safetyMarginDays;
  
  // Can we complete voyage with initial ROB + one full refuel?
  const availableWithSingleStop = (initialRob.VLSFO + initialRob.LSMGO) + (maxSingleStop - initialRob.VLSFO - initialRob.LSMGO);
  
  return (totalConsumption + safetyBuffer) > availableWithSingleStop;
}
