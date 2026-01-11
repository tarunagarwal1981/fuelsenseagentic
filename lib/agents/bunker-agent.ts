// lib/agents/bunker-agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { routeCalculatorToolSchema, executeRouteCalculatorTool } from '../tools/route-calculator';
import { portFinderToolSchema, executePortFinderTool } from '../tools/port-finder';
import { visualizeRoute } from '../../src/utils/map-visualizer';
import * as dotenv from 'dotenv';
import { Port } from '../types';
import { AgentRegistry, AgentRegistration } from '../registry/agent-registry';

dotenv.config();

/**
 * Configuration for the bunker agent
 */
interface BunkerAgentConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Claude model to use */
  model?: string;
  /** Maximum number of tool use iterations */
  maxIterations?: number;
  /** Enable detailed logging */
  enableLogging?: boolean;
  /** Automatically generate and show map visualization */
  showMap?: boolean;
}

/**
 * Bunker Optimization Agent
 * 
 * A multi-tool agent that can:
 * 1. Calculate maritime routes between ports
 * 2. Find bunker ports along routes
 * 3. Provide optimization recommendations
 * 4. Visualize routes and ports on maps
 */
export async function runBunkerAgent(
  userMessage: string,
  config: BunkerAgentConfig
): Promise<void> {
  const {
    apiKey,
    model = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229',
    maxIterations = 15,
    enableLogging = true,
    showMap = true,
  } = config;

  if (enableLogging) {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 BUNKER OPTIMIZATION AGENT STARTED');
    console.log('='.repeat(80));
    console.log(`\n💬 User: ${userMessage}\n`);
  }

  const anthropic = new Anthropic({
    apiKey,
  });

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let loopCount = 0;
  
  // Store results for map visualization
  let calculatedRoute: any = null;
  let foundPorts: any[] = [];
  let originPort: Port | null = null;
  let destinationPort: Port | null = null;

  while (loopCount < maxIterations) {
    loopCount++;
    
    if (enableLogging) {
      console.log(`\n--- Loop ${loopCount}/${maxIterations} ---`);
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
        ],
        messages: messages,
      });

      if (enableLogging) {
        console.log(`🧠 Claude's thinking... (stop_reason: ${response.stop_reason})`);
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
          console.log(`\n🔧 Claude wants to call: ${toolUseBlock.name}`);
          console.log(`📥 Input:`, JSON.stringify(toolUseBlock.input, null, 2));
        }

        let toolResult: any;

        try {
          // Execute the appropriate tool
          if (toolUseBlock.name === 'calculate_route') {
            toolResult = await executeRouteCalculatorTool(toolUseBlock.input);
            calculatedRoute = toolResult; // Store for map
            
            // Load port data for map visualization
            const portsData = await import('../../data/ports/ports.json');
            const ports = Array.isArray(portsData.default)
              ? portsData.default
              : (portsData as any).default || portsData;
            
            const input = toolUseBlock.input as any;
            originPort = ports.find(
              (p: any) => p.port_code === input.origin_port_code
            ) as Port | null;
            destinationPort = ports.find(
              (p: any) => p.port_code === input.destination_port_code
            ) as Port | null;

            if (enableLogging) {
              console.log(`\n📤 Route calculated successfully`);
              console.log(`   Distance: ${toolResult.distance_nm.toFixed(2)} nm`);
              console.log(`   Time: ${toolResult.estimated_hours.toFixed(2)} hours`);
              console.log(`   Waypoints: ${toolResult.waypoints.length}`);
            }
          } else if (toolUseBlock.name === 'find_ports_near_route') {
            toolResult = await executePortFinderTool(toolUseBlock.input);
            foundPorts = toolResult.ports; // Store for map

            if (enableLogging) {
              console.log(`\n📤 Port finder executed successfully`);
              console.log(`   Found ${toolResult.total_ports_found} ports near route`);
            }
          } else {
            throw new Error(`Unknown tool: ${toolUseBlock.name}`);
          }
        } catch (error) {
          if (enableLogging) {
            console.error(`\n❌ Tool execution failed:`, error instanceof Error ? error.message : error);
          }
          toolResult = { error: error instanceof Error ? error.message : 'Unknown error' };
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
            console.log(`\n💬 Claude's Response:\n`);
          }
          console.log(textBlock.text);
        }

        // Generate map if we have route data
        if (showMap && calculatedRoute && originPort && destinationPort) {
          try {
            if (enableLogging) {
              console.log('\n🗺️  Generating map visualization...');
            }

            const mapPath = await visualizeRoute(
              calculatedRoute,
              originPort,
              destinationPort,
              {
                openInBrowser: true,
              }
            );

            if (enableLogging) {
              console.log(`✅ Map saved: ${mapPath}`);
              
              if (foundPorts.length > 0) {
                console.log(`\n📍 Bunker ports found along route:`);
                foundPorts.slice(0, 10).forEach((foundPort, i) => {
                  const port = foundPort.port;
                  console.log(
                    `   ${(i + 1).toString().padStart(2)}. ${port.name.padEnd(25)} ` +
                    `${port.port_code.padEnd(8)} ${foundPort.distance_from_route_nm.toFixed(1).padStart(6)} nm from route`
                  );
                });
                if (foundPorts.length > 10) {
                  console.log(`   ... and ${foundPorts.length - 10} more ports`);
                }
              }
            }
          } catch (error) {
            if (enableLogging) {
              console.warn('⚠️  Could not generate map:', error instanceof Error ? error.message : error);
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
        console.error('\n❌ Error in agent loop:', error instanceof Error ? error.message : error);
      }
      throw error;
    }
  }

  if (loopCount >= maxIterations) {
    if (enableLogging) {
      console.error('\n❌ Max iterations reached');
    }
  }

  if (enableLogging) {
    console.log('\n' + '='.repeat(80));
    console.log('🏁 BUNKER OPTIMIZATION AGENT FINISHED');
    console.log('='.repeat(80) + '\n');
  }
}

/**
 * Convenience function to run the bunker agent with environment variable configuration
 * 
 * @param userMessage - The user's question or request
 * @param options - Optional overrides for default configuration
 */
export async function askBunkerAgent(
  userMessage: string,
  options?: Partial<BunkerAgentConfig>
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Please set it in your .env file.'
    );
  }

  return runBunkerAgent(userMessage, {
    apiKey,
    ...options,
  });
}

/**
 * Agent executor function for registry
 */
async function bunkerAgentExecutor(input: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const userMessage = input.message || input.query || JSON.stringify(input);
  await runBunkerAgent(userMessage, {
    apiKey,
    enableLogging: false,
    showMap: false,
  });

  return { success: true };
}

/**
 * Agent registration metadata
 * Auto-registers this agent with the AgentRegistry on import
 */
export const agentRegistration: AgentRegistration = {
  id: 'bunker_planner',
  name: 'Bunker Planner Agent',
  type: 'llm',
  description: 'Plans optimal bunker fuel strategies for maritime routes. Calculates routes, finds bunker ports, and provides optimization recommendations.',
  produces: [
    'bunker_recommendations',
    'route_calculations',
    'port_analysis',
    'optimization_suggestions',
  ],
  consumes: {
    required: ['route_query', 'port_requirements'],
    optional: ['weather_data', 'price_preferences'],
  },
  available_tools: [
    'calculate_route',
    'find_ports_near_route',
  ],
  config_file: 'config/agents/bunker-agent.yaml',
  implementation: '@/lib/agents/bunker-agent',
  model: {
    provider: 'anthropic',
    name: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    max_tokens: 4096,
  },
  executor: bunkerAgentExecutor,
};

// Auto-register on import
try {
  AgentRegistry.register(agentRegistration);
} catch (error) {
  // In case of registration errors (e.g., tools not registered yet), log but don't fail
  // This allows the agent to be imported even if registry isn't fully initialized
  console.warn(`[Bunker Agent] Registration warning: ${error instanceof Error ? error.message : error}`);
}

