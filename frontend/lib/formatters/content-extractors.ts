/**
 * Content Extractors
 * 
 * Extract and format specific content from MultiAgentState based on
 * template content_source configuration.
 */

import type { MultiAgentState } from '../multi-agent/state';

// ============================================================================
// Main Extractor
// ============================================================================

/**
 * Extract content from state based on path(s) and optional format
 */
export function extractContent(
  statePath: string | string[],
  state: MultiAgentState,
  format?: string
): string {
  // Handle array of paths - merge data from multiple sources
  if (Array.isArray(statePath)) {
    const mergedData = mergeStateData(statePath, state);
    if (!mergedData || Object.keys(mergedData).length === 0) {
      return '';
    }
    if (format) {
      return applyFormat(mergedData, format, statePath.join(', '));
    }
    return formatMergedData(mergedData, state);
  }
  
  // Handle single path
  return extractSinglePath(statePath, state, format);
}

/**
 * Merge data from multiple state paths into single object
 */
function mergeStateData(paths: string[], state: MultiAgentState): Record<string, any> {
  const merged: Record<string, any> = {};
  
  for (const path of paths) {
    const value = getNestedValue(state, path);
    if (value !== null && value !== undefined) {
      // Use the last segment of the path as the key
      const key = path.split('.').pop() || path;
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * Extract content from a single state path
 */
function extractSinglePath(
  path: string,
  state: MultiAgentState,
  format?: string
): string {
  const value = getNestedValue(state, path);
  
  if (value === null || value === undefined) {
    return '';
  }
  
  // Apply formatting if specified
  if (format) {
    return applyFormat(value, format, path);
  }
  
  // Default formatting based on value type and path
  return formatValueByPath(value, path, state);
}

/**
 * Get nested value from object using dot notation
 * Supports array access like "alternatives[0]"
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return null;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) {
      return null;
    }
    
    // Handle array access like "alternatives[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, index] = arrayMatch;
      current = current[arrayKey]?.[parseInt(index, 10)];
    } else {
      current = current[part];
    }
  }
  
  return current;
}

// ============================================================================
// Format Application
// ============================================================================

/**
 * Apply specific format to value
 */
function applyFormat(value: any, format: string, path: string): string {
  switch (format) {
    case 'table':
      return formatAsTable(value, path);
    
    case 'comparison_table':
      return formatComparisonTable(value);
    
    case 'timeline':
      return formatTimeline(value);
    
    case 'waypoints_list':
      return formatWaypointsList(value);
    
    case 'detailed_weather':
      return formatDetailedWeather(value);
    
    case 'rob_table':
      return formatROBTable(value);
    
    default:
      console.warn(`⚠️ [EXTRACTOR] Unknown format: ${format}`);
      return formatGenericValue(value);
  }
}

/**
 * Format value based on its path context
 */
function formatValueByPath(value: any, path: string, state: MultiAgentState): string {
  // Route-specific formatting
  if (path === 'route_data') {
    return formatRouteData(value);
  }
  
  // Bunker analysis formatting
  if (path === 'bunker_analysis') {
    return formatBunkerAnalysis(value, state);
  }
  
  // ROB tracking formatting
  if (path === 'rob_tracking') {
    return formatROBTracking(value, state);
  }
  
  // ROB safety status formatting
  if (path === 'rob_safety_status') {
    return formatROBSafetyStatus(value);
  }
  
  // Compliance/ECA formatting
  if (path.includes('eca_zones')) {
    return formatECAZones(value);
  }
  
  // Vessel profile formatting
  if (path === 'vessel_profile') {
    return formatVesselProfile(value);
  }
  
  // Bunker ports formatting
  if (path === 'bunker_ports') {
    return formatComparisonTable(value);
  }
  
  // Weather forecast formatting
  if (path === 'weather_forecast') {
    return formatDetailedWeather(value);
  }
  
  // ROB waypoints formatting
  if (path === 'rob_waypoints') {
    return formatROBTable(value);
  }
  
  // Generic fallback
  return formatGenericValue(value);
}

/**
 * Format merged data from multiple paths
 */
function formatMergedData(data: Record<string, any>, state: MultiAgentState): string {
  const parts: string[] = [];
  
  // Vessel profile section
  if (data.vessel_profile) {
    parts.push(formatVesselProfile(data.vessel_profile));
  }
  
  // Route data section
  if (data.route_data) {
    parts.push(formatRouteData(data.route_data));
  }
  
  // ECA consumption section
  if (data.eca_consumption) {
    parts.push(formatECAConsumption(data.eca_consumption));
  }
  
  return parts.filter(p => p).join('\n\n');
}

// ============================================================================
// Specific Formatters
// ============================================================================

/**
 * Format route data
 */
function formatRouteData(route: any): string {
  if (!route) return '';
  
  const days = (route.estimated_hours / 24).toFixed(1);
  
  let output = '**Route Information:**\n';
  output += `- Origin: ${route.origin_port_code}\n`;
  output += `- Destination: ${route.destination_port_code}\n`;
  output += `- Distance: ${route.distance_nm?.toLocaleString('en-US', { maximumFractionDigits: 0 })} nm\n`;
  output += `- Duration: ${route.estimated_hours?.toFixed(0)} hours (~${days} days)\n`;
  if (route.route_type) {
    output += `- Route Type: ${route.route_type}\n`;
  }
  
  return output;
}

/**
 * Format bunker analysis with best option
 */
function formatBunkerAnalysis(analysis: any, state: MultiAgentState): string {
  if (!analysis?.best_option) return '';
  
  const best = analysis.best_option;
  
  let output = `**Recommended Port:** ${best.port_name} (${best.port_code})\n`;
  output += `**Estimated Cost:** $${(best.total_cost_usd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
  
  output += '**Why this port:**\n';
  output += `- Lowest total cost among ${analysis.recommendations?.length || 0} ports analyzed\n`;
  
  if (best.distance_from_route_nm !== undefined) {
    if (best.distance_from_route_nm < 10) {
      output += '- Minimal deviation from planned route\n';
    } else {
      output += `- Deviation: ${best.distance_from_route_nm.toFixed(0)} nm from route\n`;
    }
  }
  
  // Check weather safety
  if (state.port_weather_status) {
    const portWeather = state.port_weather_status.find(p => p.port_code === best.port_code);
    if (portWeather?.bunkering_feasible) {
      output += '- Safe weather conditions for bunkering\n';
    }
  }
  
  // Add savings info
  if (analysis.recommendations && analysis.recommendations.length > 1) {
    const nextBest = analysis.recommendations[1];
    const savings = (nextBest.total_cost_usd || 0) - (best.total_cost_usd || 0);
    if (savings > 0) {
      output += `- Saves $${savings.toLocaleString('en-US', { maximumFractionDigits: 0 })} vs next best option\n`;
    }
  }
  
  return output;
}

/**
 * Format ROB tracking data
 */
function formatROBTracking(tracking: any, state: MultiAgentState): string {
  if (!tracking) return '';
  
  const safe = tracking.overall_safe;
  
  let output = `**Voyage Safety:** ${safe ? '✅ Safe' : '⚠️ Warning'}\n`;
  
  if (state.rob_safety_status) {
    output += `**Minimum Safety Margin:** ${state.rob_safety_status.minimum_rob_days?.toFixed(1) || 'N/A'} days\n\n`;
  }
  
  output += '**Key Points:**\n';
  output += `- Final ROB: ${tracking.final_rob?.VLSFO?.toFixed(0) || 'N/A'} MT VLSFO, ${tracking.final_rob?.LSMGO?.toFixed(0) || 'N/A'} MT LSMGO\n`;
  
  if (state.rob_waypoints && state.rob_waypoints.length > 0) {
    const first = state.rob_waypoints[0];
    const last = state.rob_waypoints[state.rob_waypoints.length - 1];
    output += `- Departure: ${first.rob_after_action?.VLSFO?.toFixed(0) || 'N/A'} MT VLSFO\n`;
    output += `- At Destination: ${last.rob_after_action?.VLSFO?.toFixed(0) || 'N/A'} MT VLSFO (${last.safety_margin_days?.toFixed(1) || 'N/A'} days margin)\n`;
  }
  
  return output;
}

/**
 * Format ROB safety status
 */
function formatROBSafetyStatus(status: any): string {
  if (!status) return '';
  
  let output = '';
  
  if (!status.overall_safe) {
    output += '**WARNING:** Safety concerns detected for this voyage.\n\n';
    
    if (status.violations && status.violations.length > 0) {
      output += '**Issues:**\n';
      status.violations.forEach((v: string) => {
        output += `- ${v}\n`;
      });
    }
    
    output += '\n**Action Required:** Review fuel requirements and consider alternative bunkering options.';
  } else {
    output += '✅ **Safe Voyage:** Sufficient fuel throughout journey\n';
    output += `- Minimum safety margin: ${status.minimum_rob_days?.toFixed(1) || 'N/A'} days\n`;
  }
  
  return output;
}

/**
 * Format ECA zones data
 */
function formatECAZones(eca: any): string {
  if (!eca) return '';
  
  if (!eca.has_eca_zones) {
    return '✅ No ECA zones crossed - VLSFO only required throughout voyage.';
  }
  
  let output = `**ECA Zones Crossed:** ${eca.eca_zones_crossed?.length || 0}\n`;
  output += `**Total MGO Required:** ${eca.fuel_requirements?.mgo_with_safety_margin_mt?.toFixed(0) || 'N/A'} MT\n\n`;
  
  if (eca.eca_zones_crossed && eca.eca_zones_crossed.length > 0) {
    output += '**Zones:**\n';
    eca.eca_zones_crossed.forEach((zone: any) => {
      output += `- ${zone.zone_name}: ${zone.distance_in_zone_nm?.toFixed(0)} nm, ${zone.estimated_mgo_consumption_mt?.toFixed(0)} MT MGO\n`;
    });
  }
  
  output += '\n*Fuel switching managed by crew as per standard procedures*';
  
  return output;
}

/**
 * Format vessel profile
 */
function formatVesselProfile(profile: any): string {
  if (!profile) return '';
  
  let output = '**Your Vessel:**\n';
  
  if (profile.current_rob) {
    output += `- Current ROB: ${profile.current_rob.VLSFO?.toFixed(0) || 'N/A'} MT VLSFO, ${profile.current_rob.LSMGO?.toFixed(0) || 'N/A'} MT LSMGO\n`;
  }
  
  if (profile.tank_capacity) {
    output += `- Tank Capacity: ${profile.tank_capacity.VLSFO?.toFixed(0) || 'N/A'} MT VLSFO, ${profile.tank_capacity.LSMGO?.toFixed(0) || 'N/A'} MT LSMGO\n`;
  }
  
  if (profile.consumption_rate) {
    output += `- Consumption: ${profile.consumption_rate.VLSFO?.toFixed(1) || 'N/A'} MT/day VLSFO, ${profile.consumption_rate.LSMGO?.toFixed(1) || 'N/A'} MT/day LSMGO\n`;
  }
  
  return output;
}

/**
 * Format ECA consumption data
 */
function formatECAConsumption(consumption: any): string {
  if (!consumption) return '';
  
  let output = '**ECA Requirements:**\n';
  output += `- ECA Distance: ${consumption.eca_distance_nm?.toFixed(0) || 'N/A'} nm\n`;
  output += `- MGO Required: ${consumption.total_mgo_mt?.toFixed(0) || 'N/A'} MT\n`;
  
  return output;
}

// ============================================================================
// Table Formatters
// ============================================================================

/**
 * Format as markdown table
 */
function formatAsTable(data: any[], path: string): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  // Determine table type based on path
  if (path.includes('rob_waypoints') || path.includes('rob')) {
    return formatROBTable(data);
  }
  
  // Generic table
  const firstItem = data[0];
  const headers = Object.keys(firstItem).slice(0, 6); // Limit columns
  
  let table = '| ' + headers.map(h => h.replace(/_/g, ' ')).join(' | ') + ' |\n';
  table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  data.slice(0, 10).forEach(item => {
    const row = headers.map(h => {
      const value = item[h];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'number') return value.toFixed(1);
      if (typeof value === 'boolean') return value ? '✅' : '❌';
      if (typeof value === 'object') return JSON.stringify(value).slice(0, 20);
      return String(value).slice(0, 30);
    });
    table += '| ' + row.join(' | ') + ' |\n';
  });
  
  return table;
}

/**
 * Format ROB waypoints as table
 */
function formatROBTable(waypoints: any[]): string {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return '';
  }
  
  let table = '| Location | VLSFO (MT) | LSMGO (MT) | Safety Margin | Status |\n';
  table += '|----------|------------|------------|---------------|--------|\n';
  
  waypoints.forEach(wp => {
    const location = wp.location || 'Unknown';
    const vlsfo = wp.rob_after_action?.VLSFO?.toFixed(0) || '-';
    const lsmgo = wp.rob_after_action?.LSMGO?.toFixed(0) || '-';
    const margin = wp.safety_margin_days?.toFixed(1) || '-';
    const status = wp.is_safe ? '✅' : '⚠️';
    
    table += `| ${location} | ${vlsfo} | ${lsmgo} | ${margin} days | ${status} |\n`;
  });
  
  return table;
}

/**
 * Format comparison table for bunker ports
 */
function formatComparisonTable(ports: any[]): string {
  if (!Array.isArray(ports) || ports.length === 0) {
    return '';
  }
  
  let table = '| Port | Fuel Cost | Deviation | Total Cost | Rank |\n';
  table += '|------|-----------|-----------|------------|------|\n';
  
  // Sort by total cost if available
  const sortedPorts = [...ports].sort((a, b) => {
    const costA = a.total_cost_usd || a.fuel_cost_usd || 0;
    const costB = b.total_cost_usd || b.fuel_cost_usd || 0;
    return costA - costB;
  });
  
  sortedPorts.slice(0, 10).forEach((port, index) => {
    const name = port.port_name || port.name || port.port_code || 'Unknown';
    const fuelCost = port.fuel_cost_usd || port.fuel_cost || 0;
    const deviation = port.deviation_cost_usd || port.deviation_cost || port.distance_from_route_nm || 0;
    const total = port.total_cost_usd || port.total_cost || fuelCost;
    const rank = port.rank || index + 1;
    const recommended = index === 0 ? ' ⭐' : '';
    
    table += `| ${name}${recommended} `;
    table += `| $${fuelCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    table += `| $${deviation.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    table += `| **$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}** `;
    table += `| ${rank} |\n`;
  });
  
  return table;
}

/**
 * Format fuel switching timeline
 */
function formatTimeline(switchingPoints: any[]): string {
  if (!Array.isArray(switchingPoints) || switchingPoints.length === 0) {
    return '';
  }
  
  let output = '';
  
  switchingPoints.forEach((point, index) => {
    const action = point.action || '';
    const hours = Math.floor(point.time_from_start_hours || 0);
    const minutes = Math.round(((point.time_from_start_hours || 0) % 1) * 60);
    
    const icon = action.includes('MGO') ? '🔴' : '🟢';
    const actionText = action.replace(/_/g, ' ');
    
    output += `${icon} **${actionText}** at ${hours}h ${minutes}m\n`;
    
    if (point.location) {
      const lat = point.location.lat?.toFixed(2) || 'N/A';
      const lon = point.location.lon || 0;
      const lonDir = lon >= 0 ? 'E' : 'W';
      output += `   Location: ${lat}°N, ${Math.abs(lon).toFixed(2)}°${lonDir}\n`;
    }
    
    if (index < switchingPoints.length - 1) {
      output += '\n';
    }
  });
  
  return output;
}

/**
 * Format waypoints list
 */
function formatWaypointsList(waypoints: any[]): string {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return '';
  }
  
  // Show first 10 and last 5 waypoints with ellipsis
  const total = waypoints.length;
  const showFirst = Math.min(10, total);
  const showLast = total > 15 ? 5 : 0;
  
  let output = '';
  
  // First waypoints
  for (let i = 0; i < showFirst; i++) {
    const wp = waypoints[i];
    const lat = (wp.lat ?? wp[0])?.toFixed(4);
    const lon = (wp.lon ?? wp[1])?.toFixed(4);
    if (lat && lon) {
      output += `${i + 1}. ${lat}°N, ${lon}°E\n`;
    }
  }
  
  // Ellipsis if needed
  if (showLast > 0) {
    output += `... (${total - showFirst - showLast} more waypoints) ...\n`;
    
    // Last waypoints
    for (let i = total - showLast; i < total; i++) {
      const wp = waypoints[i];
      const lat = (wp.lat ?? wp[0])?.toFixed(4);
      const lon = (wp.lon ?? wp[1])?.toFixed(4);
      if (lat && lon) {
        output += `${i + 1}. ${lat}°N, ${lon}°E\n`;
      }
    }
  }
  
  return output;
}

/**
 * Format detailed weather data
 */
function formatDetailedWeather(weather: any): string {
  if (!weather) return '';
  
  let output = '';
  
  // Handle array of weather points
  if (Array.isArray(weather)) {
    if (weather.length === 0) return '';
    
    output += '**Weather Forecast Along Route:**\n\n';
    
    // Show up to 5 significant points
    const significantPoints = weather.filter((p: any) => 
      p.weather?.wave_height_m > 2 || p.weather?.wind_speed_knots > 20
    ).slice(0, 5);
    
    const pointsToShow = significantPoints.length > 0 ? significantPoints : weather.slice(0, 5);
    
    pointsToShow.forEach((point: any, index: number) => {
      output += `**Point ${index + 1}** - ${point.datetime || 'Unknown time'}\n`;
      if (point.weather) {
        output += `  - Wave Height: ${point.weather.wave_height_m?.toFixed(1) || '-'} m\n`;
        output += `  - Wind Speed: ${point.weather.wind_speed_knots?.toFixed(0) || '-'} knots\n`;
        if (point.weather.sea_state) {
          output += `  - Sea State: ${point.weather.sea_state}\n`;
        }
      }
      if (point.forecast_confidence) {
        output += `  - Confidence: ${point.forecast_confidence}\n`;
      }
      output += '\n';
    });
    
    return output;
  }
  
  // Handle weather summary object
  if (typeof weather === 'object') {
    if (weather.summary) {
      output += `**Summary:** ${weather.summary}\n\n`;
    }
    
    if (weather.voyage_weather_summary) {
      const summary = weather.voyage_weather_summary;
      output += '**Voyage Conditions:**\n';
      output += `- Average Wave Height: ${summary.avg_wave_height_m?.toFixed(1) || '-'} m\n`;
      output += `- Maximum Wave Height: ${summary.max_wave_height_m?.toFixed(1) || '-'} m\n`;
      if (summary.worst_conditions_date) {
        output += `- Worst Conditions: ${summary.worst_conditions_date}\n`;
      }
    }
    
    return output;
  }
  
  return '';
}

// ============================================================================
// Generic Formatters
// ============================================================================

/**
 * Format any generic value
 */
function formatGenericValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  
  if (typeof value === 'boolean') {
    return value ? '✅ Yes' : '❌ No';
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    
    // Check if it's an array of objects
    if (typeof value[0] === 'object') {
      return formatAsTable(value, 'generic');
    }
    
    // Simple array
    return value.map((item, i) => `${i + 1}. ${String(item)}`).join('\n');
  }
  
  if (typeof value === 'object') {
    return formatObjectAsKeyValue(value);
  }
  
  return String(value);
}

/**
 * Format object as key-value pairs
 */
function formatObjectAsKeyValue(obj: Record<string, any>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return '';
  
  return keys.map(key => {
    const value = obj[key];
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    if (value === null || value === undefined) {
      return `**${formattedKey}:** N/A`;
    }
    
    if (typeof value === 'number') {
      return `**${formattedKey}:** ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
    
    if (typeof value === 'boolean') {
      return `**${formattedKey}:** ${value ? 'Yes' : 'No'}`;
    }
    
    if (typeof value === 'object') {
      return `**${formattedKey}:** (complex data)`;
    }
    
    return `**${formattedKey}:** ${value}`;
  }).join('\n');
}

// ============================================================================
// Cost Summary Formatter
// ============================================================================

/**
 * Format cost summary from bunker analysis
 */
export function formatCostSummary(analysis: any): string {
  if (!analysis?.best_option) return '';
  
  const best = analysis.best_option;
  const fuelCost = best.fuel_cost_usd || 0;
  const deviationCost = best.deviation_cost_usd || 0;
  const totalCost = best.total_cost_usd || 0;
  
  let output = `**Fuel Cost:** $${fuelCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
  output += `**Deviation Cost:** $${deviationCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
  output += `**Total:** $${totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
  
  // Calculate savings vs next best
  if (analysis.recommendations && analysis.recommendations.length > 1) {
    const nextBest = analysis.recommendations[1];
    const savings = (nextBest.total_cost_usd || 0) - totalCost;
    if (savings > 0) {
      output += `\n*Savings vs next best: $${savings.toLocaleString('en-US', { maximumFractionDigits: 0 })}*`;
    }
  }
  
  return output;
}

/**
 * Format alternative port option
 */
export function formatAlternativePort(analysis: any): string {
  if (!analysis?.recommendations || analysis.recommendations.length <= 1) {
    return '';
  }
  
  const alt = analysis.recommendations[1];
  const totalCost = alt.total_cost_usd || alt.total_cost || 0;
  
  let output = `**${alt.port_name}** - $${totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
  
  if (alt.distance_from_route_nm !== undefined) {
    if (alt.distance_from_route_nm > 50) {
      output += `Trade-off: Higher deviation (${alt.distance_from_route_nm.toFixed(0)} nm) but potentially better availability`;
    } else {
      output += `Trade-off: Slightly higher cost but minimal deviation`;
    }
  } else {
    output += `Trade-off: Alternative option if primary unavailable`;
  }
  
  return output;
}
