"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRouteAgent = runRouteAgent;
exports.askRouteAgent = askRouteAgent;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const route_calculator_1 = require("../tools/route-calculator");
const map_visualizer_1 = require("../../src/utils/map-visualizer");
/**
 * Logging utility
 */
function log(message, data) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ROUTE-AGENT] ${message}`);
    if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
    }
}
/**
 * Creates an Anthropic client instance
 */
function createAnthropicClient(apiKey) {
    return new sdk_1.default({
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
async function runRouteAgent(userMessage, config) {
    const { apiKey, model = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229', maxIterations = 10, enableLogging = true, showMap = true, } = config;
    if (enableLogging) {
        log('Starting route agent', { userMessage, model, maxIterations });
    }
    const anthropic = createAnthropicClient(apiKey);
    let toolCalls = 0;
    let messages = [
        {
            role: 'user',
            content: userMessage,
        },
    ];
    // Track route calculation results for map visualization
    let lastRouteResult = null;
    let lastRouteInput = null;
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
                        name: route_calculator_1.routeCalculatorToolSchema.name,
                        description: route_calculator_1.routeCalculatorToolSchema.description,
                        input_schema: route_calculator_1.routeCalculatorToolSchema.input_schema,
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
            const toolUseBlock = response.content.find((block) => block.type === 'tool_use');
            if (toolUseBlock) {
                toolCalls++;
                if (enableLogging) {
                    log(`Tool use requested: ${toolUseBlock.name}`, {
                        toolUseId: toolUseBlock.id,
                        input: toolUseBlock.input,
                    });
                }
                // Execute the requested tool
                let toolResult;
                let toolError = null;
                try {
                    if (toolUseBlock.name === 'calculate_route') {
                        toolResult = await (0, route_calculator_1.executeRouteCalculatorTool)(toolUseBlock.input);
                        // Store route result for map visualization
                        lastRouteResult = toolResult;
                        lastRouteInput = toolUseBlock.input;
                        if (enableLogging) {
                            log('Tool execution successful', {
                                distance: toolResult.distance_nm,
                                estimatedHours: toolResult.estimated_hours,
                                waypointCount: toolResult.waypoints.length,
                                routeType: toolResult.route_type,
                            });
                        }
                    }
                    else {
                        toolError = `Unknown tool: ${toolUseBlock.name}`;
                        if (enableLogging) {
                            log('Unknown tool requested', { toolName: toolUseBlock.name });
                        }
                    }
                }
                catch (error) {
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
            const textBlocks = response.content.filter((block) => block.type === 'text');
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
                        const portsData = await Promise.resolve().then(() => __importStar(require('../../data/ports/ports.json')));
                        const ports = Array.isArray(portsData.default)
                            ? portsData.default
                            : portsData.default || portsData;
                        const originPort = ports.find((p) => p.port_code === lastRouteInput.origin_port_code);
                        const destinationPort = ports.find((p) => p.port_code === lastRouteInput.destination_port_code);
                        if (originPort && destinationPort) {
                            console.log('\n🗺️  Generating map visualization...\n');
                            const mapPath = await (0, map_visualizer_1.visualizeRoute)(lastRouteResult, originPort, destinationPort, {
                                openInBrowser: true,
                            });
                            console.log(`✅ Map saved: ${mapPath}\n`);
                        }
                        else {
                            if (enableLogging) {
                                log('Could not find port data for map visualization', {
                                    originFound: !!originPort,
                                    destinationFound: !!destinationPort,
                                });
                            }
                        }
                    }
                    catch (error) {
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
        }
        catch (error) {
            if (enableLogging) {
                log('Error in agent loop', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    iteration,
                });
            }
            throw new Error(`Agent error at iteration ${iteration + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Max iterations reached
    if (enableLogging) {
        log('Max iterations reached', { maxIterations, toolCalls });
    }
    throw new Error(`Agent reached maximum iterations (${maxIterations}) without completing. Tool calls made: ${toolCalls}`);
}
/**
 * Convenience function to run the agent with environment variable configuration
 *
 * @param userMessage - The user's question or request
 * @param options - Optional overrides for default configuration
 * @returns Final response from Claude
 */
async function askRouteAgent(userMessage, options) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required. Please set it in your .env file.');
    }
    return runRouteAgent(userMessage, {
        apiKey,
        ...options,
    });
}
//# sourceMappingURL=route-agent.js.map