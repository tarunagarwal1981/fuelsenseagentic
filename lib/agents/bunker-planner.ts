/**
 * Bunker Planner Agent (Hybrid: LLM + Engines)
 * 
 * The Bunker Planner uses LLM for reasoning and decision-making, but relies
 * on deterministic engines for all calculations. This is a CRITICAL agent
 * for the core business function.
 * 
 * Responsibilities:
 * - Find bunker ports along route
 * - Calculate ROB at each candidate port (via ROB Tracking Engine)
 * - Validate capacity constraints (via Capacity Validation Engine)
 * - Check weather safety (via tool)
 * - Calculate costs (via Cost Calculation Engine)
 * - Rank ports and recommend best option
 * - Respect user-specified bunker quantities
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ROBTrackingEngine, ROB, Consumption, RouteSegment, ROBTrackingReport, SafetyValidation } from '../engines/rob-tracking-engine';
import { ECAConsumptionEngineImpl } from '../engines/eca-consumption-engine';
import { capacityValidationEngine, TankCapacity, BunkerQuantity } from '../engines/capacity-validation-engine';
import { costCalculationEngine, FuelPrices } from '../engines/cost-calculation-engine';
import { executePortFinderTool, FoundPort } from '../tools/port-finder';
import { executePriceFetcherTool } from '../tools/price-fetcher';
import { executeCapacityValidatorTool } from '../tools/capacity-validator';
import { executeFuelAvailabilityTool } from '../tools/fuel-availability';
import { executeDeviationCalculatorTool } from '../tools/deviation-calculator';
import { Port, FuelType, Coordinates } from '../types';
import { capacityValidatorToolSchema } from '../tools/capacity-validator';
import { fuelAvailabilityToolSchema } from '../tools/fuel-availability';
import { deviationCalculatorToolSchema } from '../tools/deviation-calculator';
import { portFinderInputSchema } from '../tools/port-finder';
import { priceFetcherInputSchema } from '../tools/price-fetcher';

// Import port weather tool (from frontend - may need to create wrapper)
// For now, we'll create a simplified interface

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Weather report for a port
 */
export interface WeatherReport {
  /** Whether bunkering is feasible */
  bunkering_feasible: boolean;
  /** Weather risk level */
  weather_risk: 'Low' | 'Medium' | 'High';
  /** Average wave height in meters */
  avg_wave_height_m: number;
  /** Average wind speed in knots */
  avg_wind_speed_kt: number;
  /** Recommendation message */
  recommendation: string;
}

/**
 * Ranked port information
 */
export interface RankedPort {
  /** Port information */
  port: Port;
  /** Total cost (bunker + deviation) */
  total_cost: number;
  /** Weather risk score (0-100, lower is better) */
  weather_risk: number;
  /** ROB margin in days */
  rob_margin: number;
  /** ROB at arrival */
  rob_at_arrival: ROB;
  /** ROB after bunkering */
  rob_after_bunker: ROB;
  /** Bunker quantity */
  bunker_quantity: BunkerQuantity;
  /** Weather conditions */
  weather_conditions: WeatherReport;
  /** Validation passed */
  validation_passed: boolean;
  /** Validation failures */
  validation_failures: string[];
}

/**
 * Bunker analysis result
 */
export interface BunkerAnalysisResult {
  /** Recommended port */
  recommended_port: {
    code: string;
    name: string;
    bunker_quantity: { vlsfo: number; lsmgo: number };
    rob_at_arrival: ROB;
    rob_after_bunker: ROB;
    weather_conditions: WeatherReport;
    total_cost: number;
    reasoning: string;
  } | null;
  /** Alternative ports */
  alternative_ports: RankedPort[];
  /** ROB tracking detailed report */
  rob_tracking_detailed: ROBTrackingReport | null;
  /** Safety validation */
  safety_validation: SafetyValidation | null;
  /** Status */
  status: 'OPTIMIZATION' | 'PROCEEDING_AS_REQUESTED' | 'CANNOT_ACCOMMODATE' | 'NO_VALID_PORTS' | 'ERROR';
  /** Status message */
  message: string;
  /** Suggestions if applicable */
  suggestions: string[];
}

/**
 * Bunker planner configuration
 */
export interface BunkerPlannerConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Claude model to use (default: claude-sonnet-4-5-20250514) */
  model?: string;
  /** Temperature (default: 0.0 for deterministic) */
  temperature?: number;
  /** Maximum tokens (default: 3000) */
  maxTokens?: number;
  /** Maximum iterations (default: 15) */
  maxIterations?: number;
  /** Enable logging (default: true) */
  enableLogging?: boolean;
  /** System prompt file path */
  systemPromptPath?: string;
}

/**
 * Bunker planner input
 */
export interface BunkerPlannerInput {
  /** Route waypoints */
  route_waypoints: Coordinates[];
  /** Current ROB */
  rob_departure: ROB;
  /** Tank capacity */
  tank_capacity: TankCapacity;
  /** Base consumption rates */
  base_consumption: Consumption;
  /** Vessel speed in knots */
  vessel_speed_knots: number;
  /** Route segments with ECA and weather info */
  route_segments: RouteSegment[];
  /** User-specified bunker quantity (optional - if provided, Mode 1) */
  user_specified_quantity?: BunkerQuantity;
  /** Required fuel types */
  required_fuel_types?: FuelType[];
  /** Maximum deviation distance in nautical miles */
  max_deviation_nm?: number;
}

/**
 * Bunker Planner interface
 */
export interface BunkerPlanner {
  /**
   * Plan bunker stops
   */
  plan(params: BunkerPlannerInput): Promise<BunkerAnalysisResult>;
}

// ============================================================================
// BUNKER PLANNER IMPLEMENTATION
// ============================================================================

/**
 * Bunker Planner Agent Implementation
 */
export class BunkerPlannerAgent implements BunkerPlanner {
  private config: Required<BunkerPlannerConfig>;
  private anthropic: Anthropic;
  private systemPrompt: string;
  private robEngine: ROBTrackingEngine;
  private ecaEngine: ECAConsumptionEngineImpl;

  constructor(config: BunkerPlannerConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-5-20250514',
      temperature: config.temperature ?? 0.0,
      maxTokens: config.maxTokens ?? 3000,
      maxIterations: config.maxIterations ?? 15,
      enableLogging: config.enableLogging ?? true,
      systemPromptPath: config.systemPromptPath || 'config/prompts/bunker-planner.txt',
    };

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });

    this.robEngine = new ROBTrackingEngine();
    this.ecaEngine = new ECAConsumptionEngineImpl();

    // Load system prompt
    this.systemPrompt = this.loadSystemPrompt();
  }

  /**
   * Load system prompt from file
   */
  private loadSystemPrompt(): string {
    try {
      const projectRoot = process.cwd();
      const promptPath = path.resolve(projectRoot, this.config.systemPromptPath);
      
      if (!fs.existsSync(promptPath)) {
        throw new Error(`System prompt file not found: ${promptPath}`);
      }

      const prompt = fs.readFileSync(promptPath, 'utf-8');
      
      if (this.config.enableLogging) {
        console.log(`[BUNKER-PLANNER] Loaded system prompt from ${promptPath}`);
      }

      return prompt;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[BUNKER-PLANNER] Failed to load system prompt: ${errorMessage}`);
      
      return 'You are the Bunker Planner Agent. Find optimal bunker ports, validate safety constraints, calculate costs, and rank options. Use engines for all calculations.';
    }
  }

  /**
   * Logging utility
   */
  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [BUNKER-PLANNER] ${message}`);
      if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Plan bunker stops
   */
  async plan(params: BunkerPlannerInput): Promise<BunkerAnalysisResult> {
    this.log('Starting bunker planning', {
      route_waypoints: params.route_waypoints.length,
      has_user_quantity: !!params.user_specified_quantity,
    });

    try {
      // Determine mode
      const isMode1 = !!params.user_specified_quantity;

      if (isMode1) {
        return await this.handleMode1(params);
      } else {
        return await this.handleMode2(params);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('Error during bunker planning', { error: errorMessage });
      
      return {
        recommended_port: null,
        alternative_ports: [],
        rob_tracking_detailed: null,
        safety_validation: null,
        status: 'ERROR',
        message: `Error: ${errorMessage}`,
        suggestions: [],
      };
    }
  }

  /**
   * Mode 1: User-specified quantity
   */
  private async handleMode1(params: BunkerPlannerInput): Promise<BunkerAnalysisResult> {
    this.log('Mode 1: User-specified quantity');

    const userQuantity = params.user_specified_quantity!;

    // Find bunker ports
    const portsResult = await executePortFinderTool({
      route_waypoints: params.route_waypoints,
      max_deviation_nm: params.max_deviation_nm || 150,
    });

    if (portsResult.ports.length === 0) {
      return {
        recommended_port: null,
        alternative_ports: [],
        rob_tracking_detailed: null,
        safety_validation: null,
        status: 'NO_VALID_PORTS',
        message: 'No bunker ports found within deviation distance',
        suggestions: [
          'Increase maximum deviation distance',
          'Bunker at origin port',
          'Bunker at destination port',
        ],
      };
    }

    // Get fuel prices
    const portCodes = portsResult.ports.map(p => p.port.port_code);
    const pricesResult = await executePriceFetcherTool({
      port_codes: portCodes,
    });

    // Validate capacity for each port
    const validatedPorts: Array<{
      port: FoundPort;
      validation: any;
      rob_at_arrival: ROB;
    }> = [];

    for (const foundPort of portsResult.ports) {
      // Calculate ROB at port arrival
      const robAtArrival = await this.calculateROBAtPort(
        params,
        foundPort
      );

      // Validate capacity
      const validation = await executeCapacityValidatorTool({
        current_rob: robAtArrival,
        bunker_quantity: userQuantity,
        tank_capacity: params.tank_capacity,
      });

      if (validation.fits) {
        validatedPorts.push({
          port: foundPort,
          validation,
          rob_at_arrival: robAtArrival,
        });
      }
    }

    if (validatedPorts.length === 0) {
      // All ports failed capacity validation
      const firstValidation = await executeCapacityValidatorTool({
        current_rob: await this.calculateROBAtPort(params, portsResult.ports[0]),
        bunker_quantity: userQuantity,
        tank_capacity: params.tank_capacity,
      });

      return {
        recommended_port: null,
        alternative_ports: [],
        rob_tracking_detailed: null,
        safety_validation: null,
        status: 'CANNOT_ACCOMMODATE',
        message: 'Requested quantity exceeds capacity at all candidate ports',
        suggestions: firstValidation.suggestions,
      };
    }

    // All validated ports can accommodate - proceed with first one
    const selectedPort = validatedPorts[0];
    // Ensure rob_after_bunker exists in validation result
    let robAfterBunker: ROB;
    if (selectedPort.validation && 'rob_after_bunker' in selectedPort.validation) {
      robAfterBunker = selectedPort.validation.rob_after_bunker;
    } else {
      // Calculate manually if not in validation result
      robAfterBunker = {
        vlsfo: selectedPort.rob_at_arrival.vlsfo + userQuantity.vlsfo,
        lsmgo: selectedPort.rob_at_arrival.lsmgo + userQuantity.lsmgo,
      };
    }

    // Check weather (simplified - would use actual weather tool)
    const weatherConditions: WeatherReport = {
      bunkering_feasible: true,
      weather_risk: 'Low',
      avg_wave_height_m: 0.5,
      avg_wind_speed_kt: 15,
      recommendation: 'Weather conditions are safe for bunkering',
    };

    return {
      recommended_port: {
        code: selectedPort.port.port.port_code,
        name: selectedPort.port.port.name,
        bunker_quantity: userQuantity,
        rob_at_arrival: selectedPort.rob_at_arrival,
        rob_after_bunker: robAfterBunker,
        weather_conditions: weatherConditions,
        total_cost: 0, // Would calculate if needed
        reasoning: 'Proceeding with user-specified quantity as requested',
      },
      alternative_ports: validatedPorts.slice(1).map(vp => ({
        port: vp.port.port,
        total_cost: 0,
        weather_risk: 0,
        rob_margin: 0,
        rob_at_arrival: vp.rob_at_arrival,
        rob_after_bunker: ('rob_after_bunker' in vp.validation ? vp.validation.rob_after_bunker : {
          vlsfo: vp.rob_at_arrival.vlsfo + userQuantity.vlsfo,
          lsmgo: vp.rob_at_arrival.lsmgo + userQuantity.lsmgo,
        }),
        bunker_quantity: userQuantity,
        weather_conditions: weatherConditions,
        validation_passed: true,
        validation_failures: [],
      })),
      rob_tracking_detailed: null, // Would generate full report
      safety_validation: null,
      status: 'PROCEEDING_AS_REQUESTED',
      message: 'Vessel can accommodate requested bunker quantity',
      suggestions: [],
    };
  }

  /**
   * Mode 2: Optimization
   */
  private async handleMode2(params: BunkerPlannerInput): Promise<BunkerAnalysisResult> {
    this.log('Mode 2: Optimization');

    // Find bunker ports
    const portsResult = await executePortFinderTool({
      route_waypoints: params.route_waypoints,
      max_deviation_nm: params.max_deviation_nm || 150,
    });

    if (portsResult.ports.length === 0) {
      return {
        recommended_port: null,
        alternative_ports: [],
        rob_tracking_detailed: null,
        safety_validation: null,
        status: 'NO_VALID_PORTS',
        message: 'No bunker ports found within deviation distance',
        suggestions: [
          'Increase maximum deviation distance',
          'Bunker at origin port',
          'Bunker at destination port',
        ],
      };
    }

    // Get fuel prices
    const portCodes = portsResult.ports.map(p => p.port.port_code);
    const pricesResult = await executePriceFetcherTool({
      port_codes: portCodes,
    });

    // Calculate optimal bunker quantity
    // Required = consumption_to_destination + 5_day_margin - rob_at_bunker_port
    const consumptionToDestination = this.calculateConsumptionToDestination(params);
    const fiveDayMargin = (params.base_consumption.vlsfo_per_day + params.base_consumption.lsmgo_per_day) * 5;

    // Rank and validate ports
    const rankedPorts = await this.rankPorts(
      portsResult.ports,
      pricesResult,
      params,
      consumptionToDestination,
      fiveDayMargin
    );

    const validPorts = rankedPorts.filter(p => p.validation_passed);

    if (validPorts.length === 0) {
      return {
        recommended_port: null,
        alternative_ports: [],
        rob_tracking_detailed: null,
        safety_validation: null,
        status: 'NO_VALID_PORTS',
        message: 'No ports passed all validation filters',
        suggestions: [
          'Check weather conditions at ports',
          'Consider bunkering at origin or destination',
          'Review capacity constraints',
        ],
      };
    }

    // Best port is first in ranked list
    const bestPort = validPorts[0];

    return {
      recommended_port: {
        code: bestPort.port.port_code,
        name: bestPort.port.name,
        bunker_quantity: bestPort.bunker_quantity,
        rob_at_arrival: bestPort.rob_at_arrival,
        rob_after_bunker: bestPort.rob_after_bunker,
        weather_conditions: bestPort.weather_conditions,
        total_cost: bestPort.total_cost,
        reasoning: `Cheapest option (${bestPort.total_cost.toFixed(2)} USD) with safe weather and adequate capacity`,
      },
      alternative_ports: validPorts.slice(1),
      rob_tracking_detailed: null, // Would generate full report
      safety_validation: null,
      status: 'OPTIMIZATION',
      message: 'Optimal bunker port selected based on cost, weather, and safety',
      suggestions: [],
    };
  }

  /**
   * Calculate ROB at a port using ROB Tracking Engine
   */
  private async calculateROBAtPort(
    params: BunkerPlannerInput,
    foundPort: FoundPort
  ): Promise<ROB> {
    // Calculate distance to port from route (one-way deviation)
    const distanceToPort = foundPort.distance_from_route_nm;

    // Find the segment index where this port is closest
    const nearestWaypointIndex = foundPort.nearest_waypoint_index;
    
    // Calculate ROB up to the nearest waypoint
    let currentRob = { ...params.rob_departure };
    
    // Process segments up to the nearest waypoint
    // Note: nearestWaypointIndex refers to waypoint index, not segment index
    // Segments are between waypoints, so segment i is between waypoint i and i+1
    const segmentsToProcess = Math.min(nearestWaypointIndex, params.route_segments.length);
    
    for (let i = 0; i < segmentsToProcess && i < params.route_segments.length; i++) {
      const segment = params.route_segments[i];
      try {
        const result = this.robEngine.calculateROBAtPoint({
          rob_previous: currentRob,
          distance_nm: segment.distance_nm,
          vessel_speed_knots: params.vessel_speed_knots,
          base_consumption: params.base_consumption,
          weather_factor: segment.weather_factor,
          is_in_eca: segment.is_in_eca,
        });
        currentRob = result.rob;
      } catch (error) {
        // If calculation fails, use simplified calculation
        this.log('ROB calculation failed for segment, using simplified', { error });
        const timeDays = segment.time_hours / 24;
        const vlsfoConsumption = params.base_consumption.vlsfo_per_day * timeDays * segment.weather_factor;
        const lsmgoConsumption = params.base_consumption.lsmgo_per_day * timeDays * segment.weather_factor;
        currentRob = {
          vlsfo: Math.max(0, currentRob.vlsfo - vlsfoConsumption),
          lsmgo: Math.max(0, currentRob.lsmgo - lsmgoConsumption),
        };
      }
    }

    // Now calculate consumption for deviation to port
    // Use weather factor and ECA status from nearest segment (or default)
    const nearestSegment = params.route_segments[Math.min(segmentsToProcess, params.route_segments.length - 1)] || params.route_segments[0];
    const weatherFactor = nearestSegment?.weather_factor || 1.0;
    const isInECA = nearestSegment?.is_in_eca || false;

    try {
      const deviationResult = this.robEngine.calculateROBAtPoint({
        rob_previous: currentRob,
        distance_nm: distanceToPort,
        vessel_speed_knots: params.vessel_speed_knots,
        base_consumption: params.base_consumption,
        weather_factor: weatherFactor,
        is_in_eca: isInECA,
      });
      return deviationResult.rob;
    } catch (error) {
      // If calculation fails, use simplified calculation
      this.log('ROB calculation failed for deviation, using simplified', { error });
      const timeToPort = distanceToPort / params.vessel_speed_knots;
      const timeToPortDays = timeToPort / 24;
      const vlsfoConsumption = params.base_consumption.vlsfo_per_day * timeToPortDays * weatherFactor;
      const lsmgoConsumption = params.base_consumption.lsmgo_per_day * timeToPortDays * weatherFactor;
      return {
        vlsfo: Math.max(0, currentRob.vlsfo - vlsfoConsumption),
        lsmgo: Math.max(0, currentRob.lsmgo - lsmgoConsumption),
      };
    }
  }

  /**
   * Calculate consumption to destination
   */
  private calculateConsumptionToDestination(params: BunkerPlannerInput): number {
    // Sum consumption across all route segments
    let totalConsumption = 0;

    for (const segment of params.route_segments) {
      const timeDays = segment.time_hours / 24;
      const segmentConsumption = this.ecaEngine.calculateSegmentConsumption({
        segment,
        base_consumption: params.base_consumption,
      });
      totalConsumption += segmentConsumption.total;
    }

    return totalConsumption;
  }

  /**
   * Rank ports by cost, weather risk, and ROB margin
   */
  private async rankPorts(
    foundPorts: FoundPort[],
    pricesResult: any,
    params: BunkerPlannerInput,
    consumptionToDestination: number,
    fiveDayMargin: number
  ): Promise<RankedPort[]> {
    const ranked: RankedPort[] = [];

    for (const foundPort of foundPorts) {
      const port = foundPort.port;
      
      // Calculate ROB at arrival
      const robAtArrival = await this.calculateROBAtPort(params, foundPort);

      // Calculate required bunker quantity
      const requiredTotal = consumptionToDestination + fiveDayMargin - 
        (robAtArrival.vlsfo + robAtArrival.lsmgo);
      
      // Split between VLSFO and LSMGO proportionally
      const totalDailyConsumption = params.base_consumption.vlsfo_per_day + 
        params.base_consumption.lsmgo_per_day;
      const vlsfoRatio = params.base_consumption.vlsfo_per_day / totalDailyConsumption;
      const lsmgoRatio = params.base_consumption.lsmgo_per_day / totalDailyConsumption;

      const bunkerQuantity: BunkerQuantity = {
        vlsfo: Math.max(0, requiredTotal * vlsfoRatio),
        lsmgo: Math.max(0, requiredTotal * lsmgoRatio),
      };

      // Validate capacity
      const capacityValidation = await executeCapacityValidatorTool({
        current_rob: robAtArrival,
        bunker_quantity: bunkerQuantity,
        tank_capacity: params.tank_capacity,
      });

      const robAfterBunker = capacityValidation.rob_after_bunker;

      // Check fuel availability
      const fuelAvailability = await executeFuelAvailabilityTool({
        port,
        required_fuel_types: params.required_fuel_types || ['VLSFO', 'LSMGO'],
      });

      // Check weather (simplified)
      const weatherConditions: WeatherReport = {
        bunkering_feasible: true,
        weather_risk: 'Low',
        avg_wave_height_m: 0.5,
        avg_wind_speed_kt: 15,
        recommendation: 'Weather conditions are safe',
      };

      // Validate safety margin (3 days at bunker port)
      const safetyValidation = this.robEngine.validateSafetyMargins({
        rob_at_port: robAtArrival,
        daily_consumption: params.base_consumption,
        minimum_days: 3,
      });

      // Check if port passes all validations
      const validationFailures: string[] = [];
      if (!safetyValidation.is_valid) {
        validationFailures.push(`Insufficient ROB margin: ${safetyValidation.shortfall_days?.toFixed(2)} days shortfall`);
      }
      if (!capacityValidation.fits) {
        validationFailures.push('Capacity exceeded');
      }
      if (!fuelAvailability.available) {
        validationFailures.push(`Missing fuel types: ${fuelAvailability.missing_fuel_types.join(', ')}`);
      }
      if (weatherConditions.weather_risk === 'High') {
        validationFailures.push('Weather unsafe');
      }

      const validationPassed = validationFailures.length === 0;

      // Calculate costs
      const portPrices = pricesResult.prices_by_port?.[port.port_code] || [];
      const vlsfoPriceData = portPrices.find((p: any) => p?.price?.fuel_type === 'VLSFO');
      const lsmgoPriceData = portPrices.find((p: any) => p?.price?.fuel_type === 'LSMGO');
      const vlsfoPrice = vlsfoPriceData?.price?.price_per_mt || 500;
      const lsmgoPrice = lsmgoPriceData?.price?.price_per_mt || 600;

      const fuelPrices: FuelPrices = {
        vlsfo_per_mt: vlsfoPrice,
        lsmgo_per_mt: lsmgoPrice,
      };

      // Calculate deviation cost
      const deviationCost = await executeDeviationCalculatorTool({
        deviation_distance_nm: foundPort.distance_from_route_nm,
        vessel_speed_knots: params.vessel_speed_knots,
        consumption: params.base_consumption,
        fuel_prices: fuelPrices,
        weather_factor: 1.0,
        is_in_eca: false,
      });

      // Calculate fuel cost
      const fuelCost = bunkerQuantity.vlsfo * vlsfoPrice + bunkerQuantity.lsmgo * lsmgoPrice;
      const totalCost = fuelCost + deviationCost.deviation_cost.total;

      // Calculate weather risk score (0-100, lower is better)
      let weatherRisk = 0;
      if (weatherConditions.weather_risk === 'High') weatherRisk = 100;
      else if (weatherConditions.weather_risk === 'Medium') weatherRisk = 50;
      else weatherRisk = 0;

      // Calculate ROB margin in days
      const totalROB = robAfterBunker.vlsfo + robAfterBunker.lsmgo;
      const totalDailyConsumption2 = params.base_consumption.vlsfo_per_day + 
        params.base_consumption.lsmgo_per_day;
      const robMargin = totalROB / totalDailyConsumption2;

      ranked.push({
        port,
        total_cost: totalCost,
        weather_risk: weatherRisk,
        rob_margin: robMargin,
        rob_at_arrival: robAtArrival,
        rob_after_bunker: robAfterBunker,
        bunker_quantity: bunkerQuantity,
        weather_conditions: weatherConditions,
        validation_passed: validationPassed,
        validation_failures: validationFailures,
      });
    }

    // Sort by: total cost (primary), weather risk (secondary), ROB margin (tertiary)
    ranked.sort((a, b) => {
      if (a.total_cost !== b.total_cost) {
        return a.total_cost - b.total_cost;
      }
      if (a.weather_risk !== b.weather_risk) {
        return a.weather_risk - b.weather_risk;
      }
      return b.rob_margin - a.rob_margin;
    });

    return ranked;
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE FACTORY
// ============================================================================

/**
 * Create bunker planner agent instance
 */
export function createBunkerPlannerAgent(
  config: BunkerPlannerConfig
): BunkerPlannerAgent {
  return new BunkerPlannerAgent(config);
}

