/**
 * Route Agent
 * 
 * An AI agent that uses Claude to answer questions about maritime routes
 * and can execute the route calculator tool when needed.
 * 
 * This agent implements the agentic loop pattern:
 * 1. Send user message to Claude with available tools
 * 2. Claude may request tool use
 * 3. Execute the requested tool
 * 4. Return tool results to Claude
 * 5. Continue until Claude provides a final text response
 */

import Anthropic from '@anthropic-ai/sdk';
import { routeCalculatorToolSchema, executeRouteCalculatorTool } from '../tools/route-calculator';
import { visualizeRoute } from '../utils/map-visualizer';
import { Port } from '../types';

/**
 * Configuration for the agent
 */
interface AgentConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Claude model to use (default: claude-3-5-sonnet-20241022) */
  model?: string;
  /** Maximum number of tool use iterations (default: 10) */
  maxIterations?: number;
  /** Enable detailed logging (default: true) */
  enableLogging?: boolean;
  /** Automatically generate and show map visualization (default: true) */
  showMap?: boolean;
}

/**
 * Agent response structure
 */
export interface AgentResponse {
  /** Final text response from Claude */
  message: string;
  /** Number of tool calls made during the conversation */
  toolCalls: number;
  /** Total tokens used (if available) */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Logging utility
 */
function log(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ROUTE-AGENT] ${message}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Creates an Anthropic client instance
 */
function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
  });
}

/**
 * Main agent function that handles the agentic loop
 * 
 * This function:
 * 1. Initializes Claude with the route calculator tool
 * 2. Sends user message
 * 3. Handles tool_use responses by executing the tool
 * 4. Returns tool results back to Claude
 * 5. Continues until Claude provides a final text response
 * 
 * @param userMessage - The user's question or request
 * @param config - Agent configuration
 * @returns Final response from Claude with metadata
 */
export async function runRouteAgent(
  userMessage: string,
  config: AgentConfig
): Promise<AgentResponse> {
  const {
    apiKey,
    model = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229',
    maxIterations = 10,
    enableLogging = true,
    showMap = true,
  } = config;

  if (enableLogging) {
    log('Starting route agent', { userMessage, model, maxIterations });
  }

  const anthropic = createAnthropicClient(apiKey);
  let toolCalls = 0;
  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userMessage,
    },
  ];
  
  // Track route calculation results for map visualization
  let lastRouteResult: any = null;
  let lastRouteInput: { origin_port_code: string; destination_port_code: string } | null = null;

  // Agentic loop: continue until we get a text response
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (enableLogging) {
      log(`Iteration ${iteration + 1}/${maxIterations}`);
    }

    try {
      // Call Claude with the current conversation and available tools
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        messages,
        tools: [
          {
            name: routeCalculatorToolSchema.name,
            description: routeCalculatorToolSchema.description,
            input_schema: routeCalculatorToolSchema.input_schema,
          },
        ],
      });

      if (enableLogging) {
        log('Claude response received', {
          stopReason: response.stop_reason,
          contentLength: response.content.length,
        });
      }

      // Check if Claude wants to use a tool
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ContentBlock & { type: 'tool_use' } =>
          block.type === 'tool_use'
      );

      if (toolUseBlock) {
        toolCalls++;
        
        if (enableLogging) {
          log(`Tool use requested: ${toolUseBlock.name}`, {
            toolUseId: toolUseBlock.id,
            input: toolUseBlock.input,
          });
        }

        // Execute the requested tool
        let toolResult: any;
        let toolError: string | null = null;

        try {
          if (toolUseBlock.name === 'calculate_route') {
            toolResult = await executeRouteCalculatorTool(toolUseBlock.input);
            
            // Store route result for map visualization
            lastRouteResult = toolResult;
            lastRouteInput = toolUseBlock.input as { origin_port_code: string; destination_port_code: string };
            
            if (enableLogging) {
              log('Tool execution successful', {
                distance: toolResult.distance_nm,
                estimatedHours: toolResult.estimated_hours,
                waypointCount: toolResult.waypoints.length,
                routeType: toolResult.route_type,
              });
            }
          } else {
            toolError = `Unknown tool: ${toolUseBlock.name}`;
            if (enableLogging) {
              log('Unknown tool requested', { toolName: toolUseBlock.name });
            }
          }
        } catch (error) {
          toolError = error instanceof Error ? error.message : 'Unknown error occurred';
          if (enableLogging) {
            log('Tool execution failed', { error: toolError });
          }
        }

        // Add Claude's response (with tool use) to the conversation
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool result to the conversation
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: toolError
                ? `Error: ${toolError}`
                : JSON.stringify(toolResult, null, 2),
              is_error: !!toolError,
            },
          ],
        });

        // Continue the loop to get Claude's response to the tool result
        continue;
      }

      // Claude provided a text response (no tool use)
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (textBlocks.length > 0) {
        const finalMessage = textBlocks.map((block) => block.text).join('\n');

        if (enableLogging) {
          log('Final response received', {
            messageLength: finalMessage.length,
            toolCalls,
            stopReason: response.stop_reason,
          });
        }

        // Generate map visualization if route was calculated and showMap is enabled
        if (showMap && lastRouteResult && lastRouteInput) {
          try {
            if (enableLogging) {
              log('Generating map visualization', {
                origin: lastRouteInput.origin_port_code,
                destination: lastRouteInput.destination_port_code,
              });
            }

            // Load port data
            const portsData = await import('../data/ports.json');
            const ports = Array.isArray(portsData.default) 
              ? portsData.default 
              : (portsData as any).default || portsData;

            const originPort = ports.find(
              (p: any) => p.port_code === lastRouteInput!.origin_port_code
            ) as Port | undefined;
            const destinationPort = ports.find(
              (p: any) => p.port_code === lastRouteInput!.destination_port_code
            ) as Port | undefined;

            if (originPort && destinationPort) {
              console.log('\n🗺️  Generating map visualization...\n');
              const mapPath = await visualizeRoute(
                lastRouteResult,
                originPort,
                destinationPort,
                {
                  openInBrowser: true,
                }
              );
              console.log(`✅ Map saved: ${mapPath}\n`);
            } else {
              if (enableLogging) {
                log('Could not find port data for map visualization', {
                  originFound: !!originPort,
                  destinationFound: !!destinationPort,
                });
              }
            }
          } catch (error) {
            if (enableLogging) {
              log('Error generating map', {
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
            console.warn('⚠️  Could not generate map visualization:', error instanceof Error ? error.message : error);
          }
        }

        return {
          message: finalMessage,
          toolCalls,
          tokensUsed: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      }

      // If we get here, Claude responded but with no text blocks
      // This shouldn't happen, but handle it gracefully
      if (enableLogging) {
        log('Warning: Response has no text blocks', { response });
      }

      return {
        message: 'I received your request but was unable to generate a response.',
        toolCalls,
      };
    } catch (error) {
      if (enableLogging) {
        log('Error in agent loop', {
          error: error instanceof Error ? error.message : 'Unknown error',
          iteration,
        });
      }

      throw new Error(
        `Agent error at iteration ${iteration + 1}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Max iterations reached
  if (enableLogging) {
    log('Max iterations reached', { maxIterations, toolCalls });
  }

  throw new Error(
    `Agent reached maximum iterations (${maxIterations}) without completing. Tool calls made: ${toolCalls}`
  );
}

/**
 * Convenience function to run the agent with environment variable configuration
 * 
 * @param userMessage - The user's question or request
 * @param options - Optional overrides for default configuration
 * @returns Final response from Claude
 */
export async function askRouteAgent(
  userMessage: string,
  options?: Partial<AgentConfig>
): Promise<AgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Please set it in your .env file.'
    );
  }

  return runRouteAgent(userMessage, {
    apiKey,
    ...options,
  });
}

