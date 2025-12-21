// src/agents/complete-bunker-agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { routeCalculatorToolSchema, executeRouteCalculatorTool } from '../tools/route-calculator';
import { portFinderToolSchema, executePortFinderTool } from '../tools/port-finder';
import { priceFetcherToolSchema, executePriceFetcherTool } from '../tools/price-fetcher';
import { bunkerAnalyzerToolSchema, executeBunkerAnalyzerTool } from '../tools/bunker-analyzer';
import { visualizeRoute } from '../utils/map-visualizer';
import * as dotenv from 'dotenv';
import { Port } from '../types';

dotenv.config();

/**
 * Configuration for the complete bunker agent
 */
interface CompleteBunkerAgentOptions {
  /** Show map visualization (default: true) */
  showMap?: boolean;
  /** Fuel quantity in metric tons (default: 1000) */
  fuelQuantityMT?: number;
  /** Vessel speed in knots (default: 14) */
  vesselSpeed?: number;
  /** Vessel consumption in MT per day (default: 35) */
  vesselConsumption?: number;
  /** Claude model to use */
  model?: string;
  /** Enable detailed logging */
  enableLogging?: boolean;
}

/**
 * Result from complete bunker agent
 */
export interface CompleteBunkerAgentResult {
  /** Calculated route data */
  route?: any;
  /** Found ports along route */
  ports?: any;
  /** Fetched price data */
  prices?: any;
  /** Analysis results */
  analysis?: any;
}

/**
 * Complete Bunker Optimization Agent
 * 
 * A comprehensive agent that orchestrates all bunker optimization tools:
 * 1. Route Calculator - Calculates optimal maritime routes
 * 2. Port Finder - Finds bunker ports along routes
 * 3. Price Fetcher - Gets current fuel prices
 * 4. Bunker Analyzer - Performs cost-benefit analysis
 * 
 * The agent automatically chains these tools together to provide
 * complete bunker optimization recommendations.
 */
export async function runCompleteBunkerAgent(
  userMessage: string,
  options: CompleteBunkerAgentOptions = {}
): Promise<CompleteBunkerAgentResult> {
  const {
    showMap = true,
    fuelQuantityMT = 1000,
    vesselSpeed = 14,
    vesselConsumption = 35,
    model = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229',
    enableLogging = true,
  } = options;

  if (enableLogging) {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 COMPLETE BUNKER OPTIMIZATION AGENT');
    console.log('='.repeat(80));
    console.log(`\n💬 User: ${userMessage}\n`);
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let loopCount = 0;
  const MAX_LOOPS = 20;

  // Store results for final output and map visualization
  let calculatedRoute: any = null;
  let foundPorts: any = null;
  let fetchedPrices: any = null;
  let analysisResult: any = null;
  let originPort: Port | null = null;
  let destinationPort: Port | null = null;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    if (enableLogging) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`Loop ${loopCount}/${MAX_LOOPS}`);
      console.log('─'.repeat(80));
    }

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        tools: [
          {
            name: routeCalculatorToolSchema.name,
            description: routeCalculatorToolSchema.description,
            input_schema: routeCalculatorToolSchema.input_schema,
          },
          {
            name: portFinderToolSchema.name,
            description: portFinderToolSchema.description,
            input_schema: portFinderToolSchema.input_schema,
          },
          {
            name: priceFetcherToolSchema.name,
            description: priceFetcherToolSchema.description,
            input_schema: priceFetcherToolSchema.input_schema,
          },
          {
            name: bunkerAnalyzerToolSchema.name,
            description: bunkerAnalyzerToolSchema.description,
            input_schema: bunkerAnalyzerToolSchema.input_schema,
          },
        ],
        messages: messages,
      });

      if (enableLogging) {
        console.log(`\n🧠 Claude: ${response.stop_reason}`);
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (!toolUseBlock) {
          if (enableLogging) {
            console.error('❌ No tool_use block found');
          }
          break;
        }

        if (enableLogging) {
          console.log(`\n🔧 Tool: ${toolUseBlock.name}`);
          const inputPreview = JSON.stringify(toolUseBlock.input, null, 2);
          console.log(
            `📥 Input: ${inputPreview.substring(0, 300)}${inputPreview.length > 300 ? '...' : ''}`
          );
        }

        let toolResult: any;

        try {
          switch (toolUseBlock.name) {
            case 'calculate_route':
              toolResult = await executeRouteCalculatorTool(toolUseBlock.input);
              calculatedRoute = toolResult;

              // Load port data for map visualization
              const portsData = await import('../data/ports.json');
              const ports = Array.isArray(portsData.default)
                ? portsData.default
                : (portsData as any).default || portsData;

              originPort = ports.find(
                (p: any) => p.port_code === toolUseBlock.input.origin_port_code
              ) as Port | null;
              destinationPort = ports.find(
                (p: any) => p.port_code === toolUseBlock.input.destination_port_code
              ) as Port | null;

              if (enableLogging) {
                console.log(`\n✅ Route calculated: ${toolResult.distance_nm.toFixed(2)} nm`);
              }
              break;

            case 'find_ports_near_route':
              toolResult = await executePortFinderTool(toolUseBlock.input);
              foundPorts = toolResult;

              if (enableLogging) {
                console.log(
                  `\n✅ Found ${toolResult.total_ports_found} ports near route`
                );
              }
              break;

            case 'fetch_fuel_prices':
              toolResult = await executePriceFetcherTool(toolUseBlock.input);
              fetchedPrices = toolResult;

              if (enableLogging) {
                console.log(
                  `\n✅ Fetched prices for ${toolResult.ports_with_prices} port(s)`
                );
              }
              break;

            case 'analyze_bunker_options':
              // Inject vessel parameters if not provided
              const analyzerInput = {
                ...toolUseBlock.input,
                fuel_quantity_mt:
                  toolUseBlock.input.fuel_quantity_mt || fuelQuantityMT,
                vessel_speed_knots:
                  toolUseBlock.input.vessel_speed_knots || vesselSpeed,
                vessel_consumption_mt_per_day:
                  toolUseBlock.input.vessel_consumption_mt_per_day ||
                  vesselConsumption,
              };
              toolResult = await executeBunkerAnalyzerTool(analyzerInput);
              analysisResult = toolResult;

              if (enableLogging) {
                console.log(
                  `\n✅ Analysis complete: Best option is ${toolResult.best_option.port_name}`
                );
                console.log(
                  `   Total cost: $${toolResult.best_option.total_cost.toLocaleString()}`
                );
              }
              break;

            default:
              throw new Error(`Unknown tool: ${toolUseBlock.name}`);
          }

          if (enableLogging) {
            console.log(`\n✅ Tool executed successfully`);
          }
        } catch (error: any) {
          if (enableLogging) {
            console.error(`\n❌ Tool failed: ${error.message}`);
          }
          toolResult = { error: error.message };
        }

        // Add messages
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult),
            },
          ],
        });
      } else if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        if (textBlock) {
          if (enableLogging) {
            console.log(`\n${'='.repeat(80)}`);
            console.log('💬 FINAL RESPONSE');
            console.log('='.repeat(80));
          }
          console.log(`\n${textBlock.text}\n`);
          if (enableLogging) {
            console.log('='.repeat(80));
          }
        }

        // Generate map with best bunker port highlighted
        if (
          showMap &&
          calculatedRoute &&
          analysisResult &&
          originPort &&
          destinationPort
        ) {
          try {
            if (enableLogging) {
              console.log('\n🗺️  Generating optimization map...');
            }

            const bestPort = analysisResult.best_option;

            // Generate the map
            await visualizeRoute(
              calculatedRoute,
              originPort,
              destinationPort,
              {
                openInBrowser: true,
              }
            );

            if (enableLogging) {
              console.log('\n📍 Bunker Optimization Results:');
              console.log(
                `   🏆 Best Option: ${bestPort.port_name} (${bestPort.port_code})`
              );
              console.log(
                `      Total Cost: $${bestPort.total_cost.toLocaleString()}`
              );
              console.log(
                `      Savings: $${bestPort.savings_vs_most_expensive.toLocaleString()} vs worst option`
              );

              if (analysisResult.recommendations.length > 1) {
                console.log('\n   Other Options:');
                analysisResult.recommendations
                  .slice(1, 6)
                  .forEach((rec: any) => {
                    console.log(
                      `   ${rec.rank}. ${rec.port_name.padEnd(25)} $${rec.total_cost.toLocaleString()} total`
                    );
                  });
              }
            }
          } catch (error) {
            if (enableLogging) {
              console.warn(
                '⚠️  Could not generate map:',
                error instanceof Error ? error.message : error
              );
            }
          }
        }

        break; // Exit loop
      } else {
        if (enableLogging) {
          console.log(`\n⚠️  Unexpected stop_reason: ${response.stop_reason}`);
        }
        break;
      }
    } catch (error) {
      if (enableLogging) {
        console.error(
          '\n❌ Error in agent loop:',
          error instanceof Error ? error.message : error
        );
      }
      throw error;
    }
  }

  if (loopCount >= MAX_LOOPS) {
    if (enableLogging) {
      console.error('\n❌ Max loops reached');
    }
  }

  if (enableLogging) {
    console.log('\n' + '='.repeat(80));
    console.log('🏁 AGENT FINISHED');
    console.log('='.repeat(80) + '\n');
  }

  return {
    route: calculatedRoute,
    ports: foundPorts,
    prices: fetchedPrices,
    analysis: analysisResult,
  };
}

/**
 * Convenience function to run the complete bunker agent
 * 
 * @param userMessage - The user's question or request
 * @param options - Optional configuration
 * @returns Complete analysis results
 */
export async function askCompleteBunkerAgent(
  userMessage: string,
  options?: CompleteBunkerAgentOptions
): Promise<CompleteBunkerAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Please set it in your .env file.'
    );
  }

  return runCompleteBunkerAgent(userMessage, options);
}

