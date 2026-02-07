/**
 * Route Service Types
 */

import { Port as RepoPort } from '@/lib/repositories/types';
import type {
  VesselCurrentState,
  VesselMasterData,
  VesselConsumptionProfile,
} from '@/lib/repositories/types';
import { Port } from '@/lib/types';

export interface Waypoint {
  coordinates: [number, number]; // [lat, lon]
  distanceFromPreviousNm: number;
  distanceFromStartNm: number;
  inECA: boolean;
  ecaZoneName?: string;
}

export interface TimelineEntry {
  waypoint: Waypoint;
  eta: Date;
  distanceFromStartNm: number;
}

export type Timeline = TimelineEntry[];

export interface ECASegment {
  startWaypointIndex: number;
  endWaypointIndex: number;
  zoneName: string;
  distanceNm: number;
  startTime: Date;
  endTime: Date;
}

export interface RouteData {
  origin: Port;
  destination: Port;
  waypoints: Waypoint[];
  totalDistanceNm: number;
  timeline: Timeline;
  ecaSegments: ECASegment[];
  estimatedHours: number;
  routeType: string;
}

export interface SeaRouteAPIResponse {
  distance: {
    unit: string;
    value: number;
  };
  duration: {
    unit: string;
    value: number;
  };
  route: {
    coordinates: [number, number][]; // [lon, lat]
    type: string;
    waypoints: number;
  };
  status: string;
  from: {
    coordinates: [number, number];
    name: string;
  };
  to: {
    coordinates: [number, number];
    name: string;
  };
}

export interface ECAZone {
  name: string;
  code: string;
  boundaries: number[][][]; // Array of polygons, each polygon is [lon, lat][]
}

/**
 * Bunker Service Types
 */

export interface BunkerPort extends RepoPort {
  deviation: number; // Deviation from route in nautical miles
}

export interface BunkerOption {
  port: BunkerPort;
  fuelType: string;
  pricePerMT: number;
  quantity: number;
  bunkerCost: number;
  deviationCost: number;
  totalCost: number;
}

export interface BunkerAnalysis {
  options: BunkerOption[];
  recommended: BunkerOption | null;
  savings: number; // Savings vs next best option
}

/**
 * Weather Service Types
 */

export interface MarineWeather {
  waveHeight: number; // meters
  windSpeed: number; // knots
  windDirection: number; // degrees (0-360)
  seaState: string;
  datetime: Date;
}

export interface WeatherImpact {
  multiplier: number; // Consumption multiplier (1.0 = no impact)
  safetyRating: 'safe' | 'caution' | 'unsafe';
  recommendation: string;
}

export interface PortWeatherSafety {
  portCode: string;
  date: Date;
  weather: MarineWeather;
  isSafe: boolean;
  restrictions: string[];
  recommendation: string;
}

/**
 * Vessel Service Types
 */

export interface VesselPlanningData {
  imo: string;
  name: string;
  current_state: VesselCurrentState;
  master_data: VesselMasterData;
  consumption_profile: VesselConsumptionProfile | null;
}

export interface ProjectedROB {
  current_rob: VesselCurrentState['current_rob'];
  projected_rob: {
    VLSFO: number;
    LSMGO: number;
    MDO?: number;
  };
  days_to_voyage_end: number;
  voyage_end_port: string;
  voyage_end_date: Date;
  projection_confidence: number;
  assumptions:
    | { note: string }
    | {
        daily_vlsfo_consumption: number;
        daily_lsmgo_consumption: number;
        based_on_reports: number;
      };
}
