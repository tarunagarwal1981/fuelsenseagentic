"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtime = void 0;
exports.POST = POST;
exports.OPTIONS = OPTIONS;
// app/api/chat/route.ts
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const route_calculator_1 = require("@/lib/tools/route-calculator");
const port_finder_1 = require("@/lib/tools/port-finder");
const price_fetcher_1 = require("@/lib/tools/price-fetcher");
const bunker_analyzer_1 = require("@/lib/tools/bunker-analyzer");
// Edge runtime for fast responses
exports.runtime = 'edge';
const anthropic = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
async function POST(req) {
    try {
        const { messages, options = {} } = await req.json();
        const { fuelQuantityMT = 1000, vesselSpeed = 14, vesselConsumption = 35, } = options;
        console.log('🤖 Agent started with', messages.length, 'messages');
        // Create a TransformStream for streaming responses
        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        // Run agent in background
        (async () => {
            try {
                const anthropicMessages = messages;
                let continueLoop = true;
                let loopCount = 0;
                const MAX_LOOPS = 20;
                // Store results for final summary
                let calculatedRoute = null;
                let foundPorts = [];
                let fetchedPrices = null;
                let analysisResult = null;
                while (continueLoop && loopCount < MAX_LOOPS) {
                    loopCount++;
                    // Stream thinking indicator
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', loop: loopCount })}\n\n`));
                    // Model selection - can be overridden via env var
                    // Available models (cheapest to most expensive):
                    // - "claude-haiku-4-5-20251001" (cheapest, excellent tool calling) ⭐ RECOMMENDED
                    // - "claude-3-haiku-20240307" (very cheap, good for simple tasks)
                    // - "claude-sonnet-4-20250514" (balanced, more expensive)
                    // - "claude-opus-4-20250514" (most capable, most expensive)
                    const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001'; // Default to Haiku 4.5 (best value)
                    const response = await anthropic.messages.create({
                        model: MODEL,
                        max_tokens: 4096,
                        tools: [
                            {
                                name: route_calculator_1.routeCalculatorToolSchema.name,
                                description: route_calculator_1.routeCalculatorToolSchema.description,
                                input_schema: {
                                    ...route_calculator_1.routeCalculatorToolSchema.input_schema,
                                    required: [...route_calculator_1.routeCalculatorToolSchema.input_schema.required],
                                },
                            },
                            {
                                name: port_finder_1.portFinderToolSchema.name,
                                description: port_finder_1.portFinderToolSchema.description,
                                input_schema: {
                                    ...port_finder_1.portFinderToolSchema.input_schema,
                                    required: [...port_finder_1.portFinderToolSchema.input_schema.required],
                                },
                            },
                            {
                                name: price_fetcher_1.priceFetcherToolSchema.name,
                                description: price_fetcher_1.priceFetcherToolSchema.description,
                                input_schema: {
                                    ...price_fetcher_1.priceFetcherToolSchema.input_schema,
                                    required: [...price_fetcher_1.priceFetcherToolSchema.input_schema.required],
                                },
                            },
                            {
                                name: bunker_analyzer_1.bunkerAnalyzerToolSchema.name,
                                description: bunker_analyzer_1.bunkerAnalyzerToolSchema.description,
                                input_schema: {
                                    ...bunker_analyzer_1.bunkerAnalyzerToolSchema.input_schema,
                                    required: [...bunker_analyzer_1.bunkerAnalyzerToolSchema.input_schema.required],
                                },
                            },
                        ],
                        messages: anthropicMessages,
                    });
                    if (response.stop_reason === 'tool_use') {
                        const toolUseBlock = response.content.find((block) => block.type === 'tool_use');
                        if (!toolUseBlock)
                            break;
                        // Stream tool usage
                        await writer.write(encoder.encode(`data: ${JSON.stringify({
                            type: 'tool_use',
                            tool: toolUseBlock.name
                        })}\n\n`));
                        let toolResult;
                        // Execute tool
                        switch (toolUseBlock.name) {
                            case 'calculate_route':
                                toolResult = await (0, route_calculator_1.executeRouteCalculatorTool)(toolUseBlock.input);
                                calculatedRoute = toolResult;
                                break;
                            case 'find_ports_near_route':
                                toolResult = await (0, port_finder_1.executePortFinderTool)(toolUseBlock.input);
                                foundPorts = toolResult.ports || [];
                                break;
                            case 'fetch_fuel_prices':
                                toolResult = await (0, price_fetcher_1.executePriceFetcherTool)(toolUseBlock.input);
                                fetchedPrices = toolResult;
                                break;
                            case 'analyze_bunker_options':
                                const analyzerInput = {
                                    ...toolUseBlock.input,
                                    fuel_quantity_mt: toolUseBlock.input.fuel_quantity_mt || fuelQuantityMT,
                                    vessel_speed_knots: toolUseBlock.input.vessel_speed_knots || vesselSpeed,
                                    vessel_consumption_mt_per_day: toolUseBlock.input.vessel_consumption_mt_per_day || vesselConsumption,
                                };
                                toolResult = await (0, bunker_analyzer_1.executeBunkerAnalyzerTool)(analyzerInput);
                                analysisResult = toolResult;
                                break;
                            default:
                                toolResult = { error: `Unknown tool: ${toolUseBlock.name}` };
                        }
                        // Add to message history
                        anthropicMessages.push({
                            role: 'assistant',
                            content: response.content,
                        });
                        anthropicMessages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: toolUseBlock.id,
                                    content: JSON.stringify(toolResult),
                                },
                            ],
                        });
                    }
                    else if (response.stop_reason === 'end_turn') {
                        const textBlock = response.content.find((block) => block.type === 'text');
                        if (textBlock) {
                            // Stream the final text response
                            await writer.write(encoder.encode(`data: ${JSON.stringify({
                                type: 'text',
                                content: textBlock.text
                            })}\n\n`));
                            // Stream structured data for UI
                            if (analysisResult) {
                                await writer.write(encoder.encode(`data: ${JSON.stringify({
                                    type: 'analysis',
                                    route: calculatedRoute,
                                    ports: foundPorts,
                                    prices: fetchedPrices,
                                    analysis: analysisResult,
                                })}\n\n`));
                            }
                        }
                        continueLoop = false;
                    }
                    else {
                        continueLoop = false;
                    }
                }
                // Stream done signal
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            }
            catch (error) {
                console.error('Agent error:', error);
                await writer.write(encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    error: error.message
                })}\n\n`));
            }
            finally {
                await writer.close();
            }
        })();
        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
    catch (error) {
        console.error('API route error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
}
// Handle OPTIONS for CORS
async function OPTIONS(req) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
//# sourceMappingURL=route.js.map