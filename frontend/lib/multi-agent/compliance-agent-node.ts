/**
 * Compliance Agent Node - DETERMINISTIC WORKFLOW
 * 
 * Executes compliance checks without LLM decision-making.
 * Currently implements:
 * 1. ECA Zone Validation
 * 
 * Future additions:
 * 2. EU ETS Calculation
 * 3. FuelEU Maritime Compliance
 * 4. CII Rating Impact
 * 
 * This agent runs AFTER route_agent and BEFORE bunker_agent
 * to inform bunker planning with compliance requirements.
 */

import { AIMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './state';
import { executeECAZoneValidatorTool } from '../tools/eca-zone-validator';
import { CONSUMPTION_CONFIG, SPEED_CONFIG } from '../tools/eca-config';

/**
 * Compliance Agent Node
 * 
 * WORKFLOW:
 * 1. Check prerequisites (route_data required)
 * 2. Run ECA zone validation
 * 3. Store compliance data in state
 * 4. Return success
 * 
 * NO LLM CALLS - Pure deterministic logic
 */
export async function complianceAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  
  console.log('\n⚖️ [COMPLIANCE-AGENT] Starting compliance checks...');
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // PREREQUISITE CHECK: Route Data Required
    // ========================================================================
    
    if (!state.route_data?.waypoints || state.route_data.waypoints.length === 0) {
      console.error('❌ [COMPLIANCE-AGENT] Missing prerequisite: route_data');
      return {
        agent_status: { 
          ...(state.agent_status || {}), 
          compliance_agent: 'failed' 
        },
        agent_errors: {
          ...(state.agent_errors || {}),
          compliance_agent: {
            error: 'Route data is required for compliance checks. Route agent must run first.',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'Error: Route data is required for compliance checks.',
          }),
        ],
      };
    }
    
    console.log('✅ [COMPLIANCE-AGENT] Prerequisite met: route_data available');
    console.log(`   Route waypoints: ${state.route_data.waypoints.length}`);
    console.log(`   Route distance: ${state.route_data.distance_nm.toFixed(1)} nm`);
    
    // ========================================================================
    // EXTRACT CONTEXT FROM SUPERVISOR
    // ========================================================================
    
    const agentContext = state.agent_context?.compliance_agent;
    if (agentContext) {
      console.log('📋 [COMPLIANCE-AGENT] Context from supervisor:');
      console.log(`   Priority: ${agentContext.priority}`);
      console.log(`   Task: ${agentContext.task_description}`);
    }
    
    // ========================================================================
    // STEP 1: ECA ZONE VALIDATION
    // ========================================================================
    
    console.log('\n🌍 [COMPLIANCE-AGENT] Running ECA zone validation...');
    
    const ecaInput = {
      route_waypoints: state.route_data.waypoints,
      vessel_speed_knots: SPEED_CONFIG.DEFAULT_VESSEL_SPEED_KNOTS, // Use default from config
      vessel_consumption: state.vessel_consumption || {
        main_engine_mt_per_day: CONSUMPTION_CONFIG.MAIN_ENGINE_MT_PER_DAY,
        auxiliary_mt_per_day: CONSUMPTION_CONFIG.AUXILIARY_MT_PER_DAY
      }
    };
    
    const ecaResult = await executeECAZoneValidatorTool(ecaInput);
    
    // Log ECA results
    if (ecaResult.has_eca_zones) {
      console.log('⚠️ [COMPLIANCE-AGENT] Route crosses ECA zones!');
      console.log(`   Zones crossed: ${ecaResult.eca_zones_crossed.length}`);
      for (const crossing of ecaResult.eca_zones_crossed) {
        console.log(`   - ${crossing.zone_name}: ${crossing.distance_in_zone_nm.toFixed(1)} nm, ${crossing.estimated_mgo_consumption_mt.toFixed(1)} MT MGO`);
      }
      console.log(`   Total MGO required: ${ecaResult.fuel_requirements.mgo_with_safety_margin_mt} MT (incl. safety margin)`);
    } else {
      console.log('✅ [COMPLIANCE-AGENT] No ECA zones crossed - VLSFO only');
    }
    
    // ========================================================================
    // STEP 2: EU ETS CALCULATION (Future)
    // ========================================================================
    
    // TODO: Add EU ETS calculator when implemented
    console.log('\n💰 [COMPLIANCE-AGENT] EU ETS calculation: Not yet implemented');
    
    // ========================================================================
    // STEP 3: FuelEU MARITIME (Future)
    // ========================================================================
    
    // TODO: Add FuelEU calculator when implemented
    console.log('📊 [COMPLIANCE-AGENT] FuelEU calculation: Not yet implemented');
    
    // ========================================================================
    // STEP 4: CII RATING (Future)
    // ========================================================================
    
    // TODO: Add CII calculator when implemented
    console.log('📉 [COMPLIANCE-AGENT] CII calculation: Not yet implemented');
    
    // ========================================================================
    // GENERATE COMPLIANCE SUMMARY MESSAGE
    // ========================================================================
    
    let summaryMessage = '⚖️ Compliance Analysis Complete:\n\n';
    
    // ECA Summary
    if (ecaResult.has_eca_zones) {
      summaryMessage += `🌍 ECA ZONES:\n`;
      summaryMessage += `   Route crosses ${ecaResult.eca_zones_crossed.length} ECA zone(s)\n`;
      summaryMessage += `   Total ECA distance: ${ecaResult.total_eca_distance_nm.toFixed(1)} nm\n`;
      summaryMessage += `   MGO required: ${ecaResult.fuel_requirements.mgo_with_safety_margin_mt} MT (with ${ecaResult.fuel_requirements.safety_margin_percent}% safety margin)\n\n`;
      
      // List zones
      for (const crossing of ecaResult.eca_zones_crossed) {
        summaryMessage += `   • ${crossing.zone_name}:\n`;
        summaryMessage += `     - Distance: ${crossing.distance_in_zone_nm.toFixed(1)} nm\n`;
        summaryMessage += `     - MGO needed: ${crossing.estimated_mgo_consumption_mt.toFixed(1)} MT\n`;
      }
      
      // Fuel switching points
      if (ecaResult.fuel_requirements.switching_points.length > 0) {
        summaryMessage += `\n   🔄 FUEL SWITCHING POINTS:\n`;
        for (const point of ecaResult.fuel_requirements.switching_points) {
          const timeStr = `${Math.floor(point.time_from_start_hours)}h ${Math.round((point.time_from_start_hours % 1) * 60)}m`;
          summaryMessage += `   • ${point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢'} ${point.action} at ${timeStr} from departure\n`;
          summaryMessage += `     Location: ${point.location.lat.toFixed(2)}°N, ${point.location.lon.toFixed(2)}°E\n`;
        }
      }
      
      // Warnings
      if (ecaResult.compliance_warnings.length > 0) {
        summaryMessage += `\n   ⚠️ WARNINGS:\n`;
        for (const warning of ecaResult.compliance_warnings) {
          summaryMessage += `   • ${warning}\n`;
        }
      }
    } else {
      summaryMessage += `✅ No ECA zones crossed - VLSFO only required\n`;
    }
    
    // ========================================================================
    // UPDATE STATE
    // ========================================================================
    
    const duration = Date.now() - startTime;
    console.log(`\n✅ [COMPLIANCE-AGENT] Completed in ${duration}ms`);
    
    return {
      // Store compliance data
      compliance_data: {
        eca_zones: ecaResult,
        // Future: eu_ets, fueleu, cii will be added here
      },
      
      // Update agent status
      agent_status: {
        ...(state.agent_status || {}),
        compliance_agent: 'success'
      },
      
      // Add summary message
      messages: [
        ...state.messages,
        new AIMessage({
          content: summaryMessage
        })
      ]
    };
    
  } catch (error: any) {
    console.error('❌ [COMPLIANCE-AGENT] Error during compliance checks:', error);
    
    return {
      agent_status: {
        ...(state.agent_status || {}),
        compliance_agent: 'failed'
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        compliance_agent: {
          error: error.message || 'Unknown error during compliance checks',
          timestamp: Date.now(),
        }
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `❌ Compliance check failed: ${error.message}`
        })
      ]
    };
  }
}

