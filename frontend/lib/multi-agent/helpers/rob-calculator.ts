/**
 * ROB Calculation Helper
 *
 * Integrates ROB Tracking Engine with bunker agent workflow.
 * Builds ROBTrackingInput from RouteData (single segment or derived from waypoints)
 * and optional weather/vessel profile.
 */

import {
  robTrackingEngine,
  type ROBTrackingInput,
  type FuelQuantity,
  type ROBTrackingOutput,
} from '@/lib/engines/rob-tracking-engine';
import {
  ecaConsumptionEngine,
  type ECAConsumptionInput,
  type ECAConsumptionOutput,
  type RouteSegment as ECARouteSegment,
} from '@/lib/engines/eca-consumption-engine';
import type { RouteData, WeatherConsumption } from '@/lib/multi-agent/state';
import type { Port } from '@/lib/types';

export interface CalculateROBResult {
  rob: ROBTrackingOutput;
  ecaConsumption: ECAConsumptionOutput | null;
}

export interface VesselROBProfile {
  initial_rob: FuelQuantity;
  capacity: FuelQuantity;
  consumption_vlsfo_per_day: number;
  consumption_lsmgo_per_day: number;
}

/**
 * Derive a single voyage segment from RouteData.
 * RouteData has distance_nm, estimated_hours, origin_port_code, destination_port_code.
 */
function buildSegmentsFromRoute(
  route: RouteData,
  consumptionVlsfoPerDay: number,
  consumptionLsmgoPerDay: number,
  weatherFactor: number
): ROBTrackingInput['segments'] {
  const durationDays = route.estimated_hours / 24;
  return [
    {
      from: route.origin_port_code,
      to: route.destination_port_code,
      distance_nm: route.distance_nm,
      consumption_mt_per_day: {
        VLSFO: consumptionVlsfoPerDay * weatherFactor,
        LSMGO: consumptionLsmgoPerDay * weatherFactor,
      },
      duration_days: durationDays,
    },
  ];
}

/**
 * Calculate ROB for the voyage using the ROB Tracking Engine.
 *
 * @param route - Route data (distance, duration, origin, destination)
 * @param weather - Optional weather consumption for avg_multiplier
 * @param vesselProfile - Initial ROB, capacity, consumption rates
 * @param bunkerPort - Optional bunker port (uses name for waypoint)
 * @param bunkerQuantity - Optional fuel to add at bunker port
 * @param ecaSegments - Optional ECA-aware route segments (from compliance_data). When set, ECA engine is used.
 */
export function calculateROBForVoyage(
  route: RouteData,
  weather: WeatherConsumption | null,
  vesselProfile: VesselROBProfile,
  bunkerPort?: Port,
  bunkerQuantity?: FuelQuantity,
  ecaSegments?: ECARouteSegment[]
): CalculateROBResult {
  const weatherFactor = weather?.voyage_weather_summary?.avg_multiplier ?? 1.0;
  const speedKnots = 14;

  if (ecaSegments && ecaSegments.length > 0) {
    const ecaInput: ECAConsumptionInput = {
      base_consumption: {
        main_engine_mt_per_day: vesselProfile.consumption_vlsfo_per_day,
        auxiliary_mt_per_day: vesselProfile.consumption_lsmgo_per_day,
        total_mt_per_day:
          vesselProfile.consumption_vlsfo_per_day + vesselProfile.consumption_lsmgo_per_day,
      },
      route_segments: ecaSegments,
      speed_knots: speedKnots,
      weather_factor: weatherFactor,
    };
    const ecaConsumption = ecaConsumptionEngine.calculateConsumption(ecaInput);
    console.log('📊 [ECA ENGINE] Consumption calculation:');
    console.log(`  - Total VLSFO: ${ecaConsumption.total_consumption_mt.VLSFO.toFixed(1)} MT`);
    console.log(`  - Total LSMGO: ${ecaConsumption.total_consumption_mt.LSMGO.toFixed(1)} MT`);
    console.log(
      `  - ECA distance: ${ecaConsumption.eca_distance_nm.toFixed(0)} nm (${ecaConsumption.eca_percentage.toFixed(1)}%)`
    );
    const robSegments: ROBTrackingInput['segments'] = ecaConsumption.segments.map((seg) => ({
      from: seg.from,
      to: seg.to,
      distance_nm: seg.distance_nm,
      consumption_mt_per_day: { VLSFO: seg.consumption_mt_per_day.VLSFO, LSMGO: seg.consumption_mt_per_day.LSMGO },
      duration_days: seg.duration_days,
    }));
    const bunkerStopsECA =
      bunkerPort && bunkerQuantity
        ? [
            {
              port_name: bunkerPort.name,
              quantity_to_bunker: bunkerQuantity,
              segment_index: Math.floor(robSegments.length / 2),
            },
          ]
        : undefined;
    const rob = robTrackingEngine.calculateROBTracking({
      initial_rob: vesselProfile.initial_rob,
      vessel_capacity: vesselProfile.capacity,
      segments: robSegments,
      bunker_stops: bunkerStopsECA,
      safety_margin_days: 3,
    });
    return { rob, ecaConsumption };
  }

  const segments = buildSegmentsFromRoute(
    route,
    vesselProfile.consumption_vlsfo_per_day,
    vesselProfile.consumption_lsmgo_per_day,
    weatherFactor
  );

  const bunkerStops =
    bunkerPort && bunkerQuantity
      ? [
          {
            port_name: bunkerPort.name,
            quantity_to_bunker: bunkerQuantity,
            segment_index: 0, // after the single segment’s arrival
          },
        ]
      : undefined;

  const input: ROBTrackingInput = {
    initial_rob: vesselProfile.initial_rob,
    vessel_capacity: vesselProfile.capacity,
    segments,
    bunker_stops: bunkerStops,
    safety_margin_days: 3,
  };

  return { rob: robTrackingEngine.calculateROBTracking(input), ecaConsumption: null };
}

/**
 * Format ROB tracking result into rob_safety_status for state.
 */
export function formatROBSafetyStatus(
  robTracking: ROBTrackingOutput,
  consumptionVlsfoPerDay: number = 30,
  consumptionLsmgoPerDay: number = 3
): {
  overall_safe: boolean;
  minimum_rob_days: number;
  violations: string[];
} {
  const vlsfoDays =
    consumptionVlsfoPerDay > 0
      ? robTracking.minimum_rob_reached.VLSFO / consumptionVlsfoPerDay
      : Infinity;
  const lsmgoDays =
    consumptionLsmgoPerDay > 0
      ? robTracking.minimum_rob_reached.LSMGO / consumptionLsmgoPerDay
      : Infinity;
  const minimum_rob_days = Math.min(vlsfoDays, lsmgoDays);

  return {
    overall_safe: robTracking.overall_safe,
    minimum_rob_days,
    violations: robTracking.safety_violations.map((v) => `${v.location}: ${v.issue}`),
  };
}
