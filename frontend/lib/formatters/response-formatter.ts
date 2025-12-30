/**
 * Response Formatter
 * 
 * Formats multi-agent state into both:
 * 1. Structured data (for enhanced UI components)
 * 2. Text output (preserves current format exactly)
 * 
 * This formatter is backwards-compatible - it preserves the exact
 * current text output format while adding optional structured data.
 */

import type { MultiAgentState } from '../multi-agent/state';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Main response interface
 */
export interface FormattedResponse {
  // NEW: Structured data for enhanced UI
  structured: {
    compliance: ComplianceCardData | null;
    weather: WeatherCardData | null;
    bunker: BunkerTableData | null;
    timeline: TimelineData | null;
    recommendations: RecommendationData | null;
  };
  
  // PRESERVED: Text output (exact current format)
  text: string;
  
  // NEW: Map overlays
  mapOverlays: MapOverlaysData | null;
}

/**
 * Compliance card data
 */
export interface ComplianceCardData {
  hasECAZones: boolean;
  severity: 'none' | 'info' | 'warning';
  
  noECAMessage?: {
    title: string;
    description: string;
    fuelType: string;
  };
  
  ecaDetails?: {
    zonesCount: number;
    zones: Array<{
      name: string;
      code: string;
      distanceNM: number;
      durationHours: number;
      percentOfRoute: number;
      mgoRequiredMT: number;
    }>;
    totalMGOMT: number;
    complianceCostUSD: number;
    switchingPoints: Array<{
      action: 'SWITCH_TO_MGO' | 'SWITCH_TO_VLSFO';
      timeFromStartHours: number;
      timeFromStartFormatted: string;
      location: { lat: number; lon: number };
      locationFormatted: string;
    }>;
    warnings: string[];
  };
}

/**
 * Weather card data
 */
export interface WeatherCardData {
  showCard: boolean;
  
  routeWeather?: {
    hasAdverseConditions: boolean;
    fuelAdjustmentMT: number;
    summary: string;
  };
  
  portWeather: Array<{
    portName: string;
    portCode: string;
    isSafe: boolean;
    conditions?: {
      windSpeedKnots: number;
      waveHeightM: number;
      visibilityKm: number;
    };
    riskFactors: string[];
  }>;
}

/**
 * Bunker table data
 */
export interface BunkerTableData {
  recommendedPort: BunkerPortRow | null;
  alternativePorts: BunkerPortRow[];
}

export interface BunkerPortRow {
  portName: string;
  portCode: string;
  isRecommended: boolean;
  
  fuelBreakdown: Array<{
    type: 'VLSFO' | 'MGO' | 'LSMGO';
    quantityMT: number;
    pricePerMT: number;
    totalCost: number;
  }>;
  
  totalQuantityMT: number;
  totalCostUSD: number;
  averagePricePerMT: number;
  
  distanceAlongRouteNM: number;
  deviationNM: number;
  
  weatherSafe: boolean;
  weatherStatus: string;
  
  confidenceScore: number;
  confidencePercentage: number;
  
  savingsVsNextBest?: number;
}

/**
 * Timeline data
 */
export interface TimelineData {
  events: Array<{
    hourFromStart: number;
    hourFormatted: string;
    type: 'DEPARTURE' | 'BUNKER' | 'SWITCH_FUEL' | 'ARRIVAL';
    icon: string;
    title: string;
    description: string;
    location?: { lat: number; lon: number };
    locationFormatted?: string;
    actionRequired: boolean;
  }>;
}

/**
 * Recommendations data
 */
export interface RecommendationData {
  recommendations: Array<{
    type: 'cost' | 'compliance' | 'safety' | 'optimization';
    priority: 'high' | 'medium' | 'low';
    text: string;
    actionable: boolean;
  }>;
}

/**
 * Map overlays data
 */
export interface MapOverlaysData {
  ecaZones: Array<{
    name: string;
    code: string;
    polygon: Array<[number, number]>;
    style: {
      fillColor: string;
      strokeColor: string;
      strokeWidth: number;
    };
  }>;
  
  switchingPoints: Array<{
    id: string;
    location: [number, number];
    action: 'SWITCH_TO_MGO' | 'SWITCH_TO_VLSFO';
    icon: string;
    popup: {
      title: string;
      timeFromStart: string;
      coordinates: string;
      instructions: string[];
    };
  }>;
  
  fuelTypeRoute: Array<{
    segment: Array<[number, number]>;
    fuelType: 'VLSFO' | 'MGO';
    style: {
      color: string;
      weight: number;
      dashArray?: string;
    };
  }>;
}

// ============================================================================
// Main Formatter Function
// ============================================================================

/**
 * Format response from multi-agent state
 */
export function formatResponse(state: MultiAgentState): FormattedResponse {
  return {
    structured: {
      compliance: formatComplianceCard(state),
      weather: formatWeatherCard(state),
      bunker: formatBunkerTable(state),
      timeline: formatTimeline(state),
      recommendations: formatRecommendations(state),
    },
    text: formatTextOutput(state),
    mapOverlays: formatMapOverlays(state),
  };
}

// ============================================================================
// Helper Formatters
// ============================================================================

/**
 * Format compliance card data
 */
function formatComplianceCard(state: MultiAgentState): ComplianceCardData | null {
  if (!state.compliance_data?.eca_zones) {
    return null;
  }
  
  const eca = state.compliance_data.eca_zones;
  
  if (!eca.has_eca_zones) {
    return {
      hasECAZones: false,
      severity: 'none',
      noECAMessage: {
        title: 'No Regulatory Restrictions',
        description: 'Route clear of all ECA zones',
        fuelType: 'VLSFO (0.5% sulfur) authorized throughout voyage',
      },
    };
  }
  
  // Calculate compliance cost (MGO premium over VLSFO)
  const complianceCost = calculateComplianceCost(eca, state);
  
  return {
    hasECAZones: true,
    severity: eca.eca_zones_crossed.length > 1 ? 'warning' : 'info',
    ecaDetails: {
      zonesCount: eca.eca_zones_crossed.length,
      zones: eca.eca_zones_crossed.map(zone => ({
        name: zone.zone_name,
        code: zone.zone_code,
        distanceNM: parseFloat(zone.distance_in_zone_nm.toFixed(1)),
        durationHours: parseFloat(zone.time_in_zone_hours.toFixed(1)),
        percentOfRoute: state.route_data ? parseFloat(((zone.distance_in_zone_nm / state.route_data.distance_nm) * 100).toFixed(1)) : 0,
        mgoRequiredMT: parseFloat(zone.estimated_mgo_consumption_mt.toFixed(0)),
      })),
      totalMGOMT: eca.fuel_requirements.mgo_with_safety_margin_mt,
      complianceCostUSD: complianceCost,
      switchingPoints: eca.fuel_requirements.switching_points.map(point => {
        const hours = Math.floor(point.time_from_start_hours);
        const minutes = Math.round((point.time_from_start_hours % 1) * 60);
        return {
          action: point.action,
          timeFromStartHours: point.time_from_start_hours,
          timeFromStartFormatted: `${hours}h ${minutes}m`,
          location: point.location,
          locationFormatted: `${point.location.lat.toFixed(2)}°N, ${Math.abs(point.location.lon).toFixed(2)}°${point.location.lon >= 0 ? 'E' : 'W'}`,
        };
      }),
      warnings: eca.compliance_warnings || [],
    },
  };
}

/**
 * Calculate compliance cost (MGO premium over VLSFO)
 */
function calculateComplianceCost(eca: any, state: MultiAgentState): number {
  // Try to get actual prices from bunker analysis
  // Note: This is a simplified calculation - actual implementation may need
  // to extract fuel breakdown from bunker analysis if available
  const mgoQty = eca.fuel_requirements.mgo_with_safety_margin_mt;
  
  // Fallback: estimate (MGO typically $100-150 more per MT than VLSFO)
  const premiumPerMT = 130; // Conservative estimate
  return mgoQty * premiumPerMT;
}

/**
 * Format weather card data
 */
function formatWeatherCard(state: MultiAgentState): WeatherCardData | null {
  const userQuery = state.messages.find(m => {
    const type = (m as any)._getType?.() || (m as any).getType?.();
    return type === 'human';
  })?.content?.toString() || '';
  const askedForWeather = /weather|forecast|condition|wind|wave/i.test(userQuery);
  
  const hasWeatherData = state.weather_forecast || state.port_weather_status;
  
  if (!hasWeatherData) {
    return null;
  }
  
  const portWeather = state.port_weather_status?.map(port => ({
    portName: port.port_name,
    portCode: port.port_code || '',
    isSafe: port.bunkering_feasible,
    conditions: port.weather_during_bunkering ? {
      windSpeedKnots: port.weather_during_bunkering.avg_wind_speed_kt || 0,
      waveHeightM: port.weather_during_bunkering.avg_wave_height_m || 0,
      visibilityKm: 10, // Default if not available
    } : undefined,
    riskFactors: port.weather_risk === 'High' ? ['High weather risk'] : 
                 port.weather_risk === 'Medium' ? ['Moderate weather risk'] : [],
  })) || [];
  
  return {
    showCard: askedForWeather || portWeather.some(p => !p.isSafe),
    routeWeather: state.weather_consumption ? {
      hasAdverseConditions: state.weather_consumption.additional_fuel_needed_mt > 1,
      fuelAdjustmentMT: state.weather_consumption.additional_fuel_needed_mt,
      summary: state.weather_consumption.additional_fuel_needed_mt > 1 
        ? `Adverse conditions expected (+${state.weather_consumption.additional_fuel_needed_mt.toFixed(0)} MT fuel)`
        : 'Favorable conditions expected',
    } : undefined,
    portWeather,
  };
}

/**
 * Format bunker table data
 */
function formatBunkerTable(state: MultiAgentState): BunkerTableData | null {
  if (!state.bunker_analysis) {
    return null;
  }
  
  const formatPort = (port: any, isRecommended: boolean, savingsVsNext?: number): BunkerPortRow => {
    // Extract fuel breakdown if available (may need to be constructed from analysis)
    // For now, create a simple breakdown from available data
    const fuelBreakdown: Array<{
      type: 'VLSFO' | 'MGO' | 'LSMGO';
      quantityMT: number;
      pricePerMT: number;
      totalCost: number;
    }> = [];
    
    // If we have ECA compliance, we might need MGO
    const hasECA = state.compliance_data?.eca_zones?.has_eca_zones;
    
    // For now, use single fuel type (VLSFO) - this will be enhanced when
    // we have access to actual fuel breakdown from bunker analysis
    const totalQuantity = 650; // Default - should be extracted from state or query
    const pricePerMT = (port as any).fuel_price_per_mt || (port.fuel_cost_usd / totalQuantity) || 550;
    const totalCost = port.total_cost_usd || port.fuel_cost_usd || 0;
    
    fuelBreakdown.push({
      type: 'VLSFO',
      quantityMT: totalQuantity,
      pricePerMT: pricePerMT,
      totalCost: totalCost,
    });
    
    return {
      portName: port.port_name,
      portCode: port.port_code || '',
      isRecommended,
      fuelBreakdown,
      totalQuantityMT: totalQuantity,
      totalCostUSD: port.total_cost_usd || port.fuel_cost_usd || totalCost,
      averagePricePerMT: pricePerMT,
      distanceAlongRouteNM: port.distance_along_route_nm || 0,
      deviationNM: port.distance_from_route_nm || 0,
      weatherSafe: true, // Will be enhanced with actual weather data
      weatherStatus: 'Safe',
      confidenceScore: 0.8,
      confidencePercentage: 80,
      savingsVsNextBest: savingsVsNext,
    };
  };
  
  const best = state.bunker_analysis.best_option;
  const alternatives = state.bunker_analysis.recommendations || [];
  
  // Calculate savings
  let savingsVsNext: number | undefined;
  if (alternatives.length > 1) {
    savingsVsNext = (alternatives[1].total_cost_usd || 0) - 
                    (alternatives[0].total_cost_usd || 0);
  }
  
  return {
    recommendedPort: best ? formatPort(best, true, savingsVsNext) : null,
    alternativePorts: alternatives.slice(1).map((port, idx) => {
      const savings = idx < alternatives.length - 2 ? 
        (alternatives[idx + 2].total_cost_usd || 0) - 
        (port.total_cost_usd || 0) : undefined;
      return formatPort(port, false, savings);
    }),
  };
}

/**
 * Format timeline data
 */
function formatTimeline(state: MultiAgentState): TimelineData | null {
  const events: TimelineData['events'] = [];
  
  // Event 1: Departure
  if (state.route_data) {
    events.push({
      hourFromStart: 0,
      hourFormatted: '0h',
      type: 'DEPARTURE',
      icon: '⚓',
      title: `Depart ${state.route_data.origin_port_code}`,
      description: 'Starting voyage with VLSFO',
      actionRequired: false,
    });
  }
  
  // Event 2: Bunker stop (if applicable)
  if (state.bunker_analysis?.best_option) {
    const bunkerHour = estimateBunkerStopTime(state);
    events.push({
      hourFromStart: bunkerHour,
      hourFormatted: `${Math.floor(bunkerHour)}h`,
      type: 'BUNKER',
      icon: '⛽',
      title: `Bunker at ${state.bunker_analysis.best_option.port_name}`,
      description: formatBunkerDescription(state),
      actionRequired: true,
    });
  }
  
  // Event 3+: Fuel switching points
  if (state.compliance_data?.eca_zones?.fuel_requirements.switching_points) {
    for (const point of state.compliance_data.eca_zones.fuel_requirements.switching_points) {
      const hours = Math.floor(point.time_from_start_hours);
      const minutes = Math.round((point.time_from_start_hours % 1) * 60);
      
      events.push({
        hourFromStart: point.time_from_start_hours,
        hourFormatted: `${hours}h ${minutes}m`,
        type: 'SWITCH_FUEL',
        icon: point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢',
        title: point.action.replace('_', ' '),
        description: point.action === 'SWITCH_TO_MGO' ? 'Entering ECA zone' : 'Exiting ECA zone',
        location: point.location,
        locationFormatted: `${point.location.lat.toFixed(2)}°N, ${Math.abs(point.location.lon).toFixed(2)}°${point.location.lon >= 0 ? 'E' : 'W'}`,
        actionRequired: true,
      });
    }
  }
  
  // Final Event: Arrival
  if (state.route_data) {
    events.push({
      hourFromStart: state.route_data.estimated_hours,
      hourFormatted: `${Math.floor(state.route_data.estimated_hours)}h`,
      type: 'ARRIVAL',
      icon: '🏁',
      title: `Arrive ${state.route_data.destination_port_code}`,
      description: 'Voyage complete',
      actionRequired: false,
    });
  }
  
  // Sort events by time
  events.sort((a, b) => a.hourFromStart - b.hourFromStart);
  
  return { events };
}

/**
 * Estimate bunker stop time
 */
function estimateBunkerStopTime(state: MultiAgentState): number {
  if (state.bunker_analysis?.best_option?.distance_from_route_nm && state.route_data) {
    const vesselSpeed = 14; // Default speed in knots
    return state.bunker_analysis.best_option.distance_from_route_nm / vesselSpeed;
  }
  return state.route_data?.estimated_hours ? state.route_data.estimated_hours * 0.25 : 100;
}

/**
 * Format bunker description
 */
function formatBunkerDescription(state: MultiAgentState): string {
  const best = state.bunker_analysis?.best_option;
  if (!best) return '';
  
  // For now, simple description - will be enhanced with fuel breakdown
  return `Load fuel at ${best.port_name}`;
}

/**
 * Format recommendations data
 */
function formatRecommendations(state: MultiAgentState): RecommendationData | null {
  const recs = generateRecommendations(state);
  
  if (recs.length === 0) {
    return null;
  }
  
  return {
    recommendations: recs.map(text => {
      let type: 'cost' | 'compliance' | 'safety' | 'optimization' = 'optimization';
      let priority: 'high' | 'medium' | 'low' = 'medium';
      
      if (text.includes('MGO') || text.includes('switch') || text.includes('ECA')) {
        type = 'compliance';
        priority = 'high';
      } else if (text.includes('saves') || text.includes('$')) {
        type = 'cost';
        priority = 'medium';
      } else if (text.includes('weather') || text.includes('unsafe')) {
        type = 'safety';
        priority = 'high';
      }
      
      return {
        type,
        priority,
        text,
        actionable: true,
      };
    }),
  };
}

/**
 * Generate smart recommendations
 */
function generateRecommendations(state: MultiAgentState): string[] {
  const recs: string[] = [];
  
  // ECA-related recommendations
  if (state.compliance_data?.eca_zones?.has_eca_zones) {
    const eca = state.compliance_data.eca_zones;
    const mgoRequired = eca.fuel_requirements.mgo_with_safety_margin_mt;
    
    if (state.bunker_analysis?.best_option) {
      // Check if MGO is available (simplified check)
      recs.push(`Confirm ${mgoRequired.toFixed(0)} MT MGO availability at ${state.bunker_analysis.best_option.port_name}`);
    }
    
    if (eca.fuel_requirements.switching_points.length > 0) {
      const firstSwitch = eca.fuel_requirements.switching_points[0];
      const hours = Math.floor(firstSwitch.time_from_start_hours);
      recs.push(`Prepare crew for fuel switch approximately ${hours} hours after departure`);
    }
  }
  
  // Cost optimization
  if (state.bunker_analysis?.recommendations && state.bunker_analysis.recommendations.length > 1) {
    const best = state.bunker_analysis.recommendations[0];
    const second = state.bunker_analysis.recommendations[1];
    const savings = (second.total_cost_usd || 0) - (best.total_cost_usd || 0);
    if (savings > 1000) {
      recs.push(`Choosing ${best.port_name} saves $${savings.toFixed(0)} vs ${second.port_name}`);
    }
  }
  
  return recs;
}

/**
 * Format map overlays data
 */
function formatMapOverlays(state: MultiAgentState): MapOverlaysData | null {
  if (!state.compliance_data?.eca_zones) {
    return null;
  }
  
  // This will be populated with actual ECA zone polygons
  // For now, return basic structure
  return {
    ecaZones: [],  // TODO: Add ECA zone polygons
    switchingPoints: [],  // TODO: Add switching point markers
    fuelTypeRoute: [],  // TODO: Add colored route segments
  };
}

/**
 * Format text output - PRESERVES EXACT CURRENT FORMAT
 * 
 * This function replicates the current finalize node text output format.
 * It should match the output structure exactly as it appears in the
 * current implementation.
 */
function formatTextOutput(state: MultiAgentState): string {
  let output = '';
  
  // Section 1: Route Information (if available)
  if (state.route_data) {
    output += '🗺️ **ROUTE INFORMATION**\n';
    output += `Origin: ${state.route_data.origin_port_code}\n`;
    output += `Destination: ${state.route_data.destination_port_code}\n`;
    output += `Distance: ${state.route_data.distance_nm.toFixed(1)} nm\n`;
    output += `Estimated Time: ${state.route_data.estimated_hours.toFixed(0)} hours\n`;
  }
  
  // Section 2: Compliance (if data exists)
  if (state.compliance_data?.eca_zones) {
    const eca = state.compliance_data.eca_zones;
    
    if (!eca.has_eca_zones) {
      output += '\n\n✅ No ECA zones crossed - VLSFO only required\n';
    } else {
      output += '\n\n⚖️ **REGULATORY COMPLIANCE**\n';
      output += `ECA Zones Crossed: ${eca.eca_zones_crossed.length}\n`;
      output += `Total ECA Distance: ${eca.total_eca_distance_nm.toFixed(1)} nm\n`;
      output += `MGO Required: ${eca.fuel_requirements.mgo_with_safety_margin_mt} MT\n\n`;
      
      output += '**Zones:**\n';
      for (const zone of eca.eca_zones_crossed) {
        output += `  • ${zone.zone_name}\n`;
        output += `    Distance: ${zone.distance_in_zone_nm.toFixed(1)} nm, MGO: ${zone.estimated_mgo_consumption_mt.toFixed(0)} MT\n`;
      }
      
      if (eca.fuel_requirements.switching_points.length > 0) {
        output += '\n🔄 **Fuel Switching Points:**\n';
        for (const point of eca.fuel_requirements.switching_points) {
          const hours = Math.floor(point.time_from_start_hours);
          const minutes = Math.round((point.time_from_start_hours % 1) * 60);
          const emoji = point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢';
          output += `  ${emoji} ${point.action} at ${hours}h ${minutes}m from departure\n`;
          output += `     Location: ${point.location.lat.toFixed(2)}°N, ${Math.abs(point.location.lon).toFixed(2)}°${point.location.lon >= 0 ? 'E' : 'W'}\n`;
        }
      }
    }
  }
  
  // Section 3: Weather (only if user asked or issues detected)
  const userQuery = state.messages.find(m => {
    const type = (m as any)._getType?.() || (m as any).getType?.();
    return type === 'human';
  })?.content?.toString() || '';
  const askedForWeather = /weather|forecast|condition|wind|wave/i.test(userQuery);
  
  if (askedForWeather && state.weather_forecast) {
    output += '\n\n🌊 **WEATHER ANALYSIS**\n';
    
    if (state.weather_consumption) {
      const adjustment = state.weather_consumption.additional_fuel_needed_mt;
      if (Math.abs(adjustment) > 1) {
        const sign = adjustment > 0 ? '+' : '';
        output += `Fuel Adjustment: ${sign}${adjustment.toFixed(0)} MT (${adjustment > 0 ? 'adverse' : 'favorable'} conditions)\n`;
      }
    }
    
    if (state.port_weather_status && state.port_weather_status.length > 0) {
      const unsafePorts = state.port_weather_status.filter(p => !p.bunkering_feasible);
      if (unsafePorts.length > 0) {
        output += `\n⚠️ Weather Unsafe Ports: ${unsafePorts.length}\n`;
        for (const port of unsafePorts.slice(0, 3)) {
          output += `  • ${port.port_name}: ${port.weather_risk} risk\n`;
        }
      }
    }
  }
  
  // Section 4: Bunker Recommendation (if available)
  if (state.bunker_analysis?.best_option) {
    output += '\n\n⛽ **BUNKER RECOMMENDATION**\n';
    const best = state.bunker_analysis.best_option;
    
    output += `**Port:** ${best.port_name}\n`;
    
    // Check if ECA compliance affects bunker
    const hasCompliance = state.compliance_data?.eca_zones?.has_eca_zones;
    
    // For now, simple output - will be enhanced with fuel breakdown when available
    const totalCost = best.total_cost_usd || best.fuel_cost_usd || 0;
    output += `**Total Cost:** $${totalCost.toFixed(0)}\n`;
    
    if (best.distance_from_route_nm !== undefined && best.distance_from_route_nm > 0) {
      output += `Distance Deviation: ${best.distance_from_route_nm.toFixed(1)} nm\n`;
    }
    
    if (state.port_weather_status && state.port_weather_status.length > 0) {
      const portWeather = state.port_weather_status.find(p => p.port_code === best.port_code);
      if (portWeather) {
        const safetyEmoji = portWeather.bunkering_feasible ? '✅' : '⚠️';
        output += `Weather Safety: ${safetyEmoji} ${portWeather.bunkering_feasible ? 'Safe' : 'Unsafe'}\n`;
      }
    }
  }
  
  // Section 5: Recommendations (smart suggestions)
  const recommendations = generateRecommendations(state);
  if (recommendations.length > 0) {
    output += '\n\n💡 **RECOMMENDATIONS**\n';
    for (const rec of recommendations) {
      output += `  • ${rec}\n`;
    }
  }
  
  return output.trim();
}

