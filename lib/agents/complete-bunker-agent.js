"use strict";
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
exports.runCompleteBunkerAgent = runCompleteBunkerAgent;
exports.askCompleteBunkerAgent = askCompleteBunkerAgent;
// lib/agents/complete-bunker-agent.ts
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const route_calculator_1 = require("../tools/route-calculator");
const port_finder_1 = require("../tools/port-finder");
const price_fetcher_1 = require("../tools/price-fetcher");
const bunker_analyzer_1 = require("../tools/bunker-analyzer");
const map_visualizer_1 = require("../../src/utils/map-visualizer");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
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
async function runCompleteBunkerAgent(userMessage, options = {}) {
    const { showMap = true, fuelQuantityMT = 1000, vesselSpeed = 14, vesselConsumption = 35, model = process.env.CLAUDE_MODEL || 'claude-3-opus-20240229', enableLogging = true, } = options;
    if (enableLogging) {
        console.log('\n' + '='.repeat(80));
        console.log('🤖 COMPLETE BUNKER OPTIMIZATION AGENT');
        console.log('='.repeat(80));
        console.log(`\n💬 User: ${userMessage}\n`);
    }
    const anthropic = new sdk_1.default({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
    const messages = [
        {
            role: 'user',
            content: userMessage,
        },
    ];
    let loopCount = 0;
    const MAX_LOOPS = 20;
    // Store results for final output and map visualization
    let calculatedRoute = null;
    let foundPorts = null;
    let fetchedPrices = null;
    let analysisResult = null;
    let originPort = null;
    let destinationPort = null;
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
                        name: route_calculator_1.routeCalculatorToolSchema.name,
                        description: route_calculator_1.routeCalculatorToolSchema.description,
                        input_schema: route_calculator_1.routeCalculatorToolSchema.input_schema,
                    },
                    {
                        name: port_finder_1.portFinderToolSchema.name,
                        description: port_finder_1.portFinderToolSchema.description,
                        input_schema: port_finder_1.portFinderToolSchema.input_schema,
                    },
                    {
                        name: price_fetcher_1.priceFetcherToolSchema.name,
                        description: price_fetcher_1.priceFetcherToolSchema.description,
                        input_schema: price_fetcher_1.priceFetcherToolSchema.input_schema,
                    },
                    {
                        name: bunker_analyzer_1.bunkerAnalyzerToolSchema.name,
                        description: bunker_analyzer_1.bunkerAnalyzerToolSchema.description,
                        input_schema: bunker_analyzer_1.bunkerAnalyzerToolSchema.input_schema,
                    },
                ],
                messages: messages,
            });
            if (enableLogging) {
                console.log(`\n🧠 Claude: ${response.stop_reason}`);
            }
            if (response.stop_reason === 'tool_use') {
                const toolUseBlock = response.content.find((block) => block.type === 'tool_use');
                if (!toolUseBlock) {
                    if (enableLogging) {
                        console.error('❌ No tool_use block found');
                    }
                    break;
                }
                if (enableLogging) {
                    console.log(`\n🔧 Tool: ${toolUseBlock.name}`);
                    const inputPreview = JSON.stringify(toolUseBlock.input, null, 2);
                    console.log(`📥 Input: ${inputPreview.substring(0, 300)}${inputPreview.length > 300 ? '...' : ''}`);
                }
                let toolResult;
                try {
                    switch (toolUseBlock.name) {
                        case 'calculate_route':
                            toolResult = await (0, route_calculator_1.executeRouteCalculatorTool)(toolUseBlock.input);
                            calculatedRoute = toolResult;
                            // Load port data for map visualization
                            const portsData = await Promise.resolve().then(() => __importStar(require('../../data/ports/ports.json')));
                            const ports = Array.isArray(portsData.default)
                                ? portsData.default
                                : portsData.default || portsData;
                            const routeInput = toolUseBlock.input;
                            originPort = ports.find((p) => p.port_code === routeInput.origin_port_code);
                            destinationPort = ports.find((p) => p.port_code === routeInput.destination_port_code);
                            if (enableLogging) {
                                console.log(`\n✅ Route calculated: ${toolResult.distance_nm.toFixed(2)} nm`);
                            }
                            break;
                        case 'find_ports_near_route':
                            toolResult = await (0, port_finder_1.executePortFinderTool)(toolUseBlock.input);
                            foundPorts = toolResult;
                            if (enableLogging) {
                                console.log(`\n✅ Found ${toolResult.total_ports_found} ports near route`);
                            }
                            break;
                        case 'fetch_fuel_prices':
                            toolResult = await (0, price_fetcher_1.executePriceFetcherTool)(toolUseBlock.input);
                            fetchedPrices = toolResult;
                            if (enableLogging) {
                                console.log(`\n✅ Fetched prices for ${toolResult.ports_with_prices} port(s)`);
                            }
                            break;
                        case 'analyze_bunker_options':
                            // Inject vessel parameters if not provided
                            const input = toolUseBlock.input;
                            const analyzerInput = {
                                ...input,
                                fuel_quantity_mt: input.fuel_quantity_mt || fuelQuantityMT,
                                vessel_speed_knots: input.vessel_speed_knots || vesselSpeed,
                                vessel_consumption_mt_per_day: input.vessel_consumption_mt_per_day ||
                                    vesselConsumption,
                            };
                            toolResult = await (0, bunker_analyzer_1.executeBunkerAnalyzerTool)(analyzerInput);
                            analysisResult = toolResult;
                            if (enableLogging) {
                                console.log(`\n✅ Analysis complete: Best option is ${toolResult.best_option.port_name}`);
                                console.log(`   Total cost: $${toolResult.best_option.total_cost.toLocaleString()}`);
                            }
                            break;
                        default:
                            throw new Error(`Unknown tool: ${toolUseBlock.name}`);
                    }
                    if (enableLogging) {
                        console.log(`\n✅ Tool executed successfully`);
                    }
                }
                catch (error) {
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
            }
            else if (response.stop_reason === 'end_turn') {
                const textBlock = response.content.find((block) => block.type === 'text');
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
                if (showMap &&
                    calculatedRoute &&
                    analysisResult &&
                    originPort &&
                    destinationPort) {
                    try {
                        if (enableLogging) {
                            console.log('\n🗺️  Generating optimization map...');
                        }
                        const bestPort = analysisResult.best_option;
                        // Generate the map
                        await (0, map_visualizer_1.visualizeRoute)(calculatedRoute, originPort, destinationPort, {
                            openInBrowser: true,
                        });
                        if (enableLogging) {
                            console.log('\n📍 Bunker Optimization Results:');
                            console.log(`   🏆 Best Option: ${bestPort.port_name} (${bestPort.port_code})`);
                            console.log(`      Total Cost: $${bestPort.total_cost.toLocaleString()}`);
                            console.log(`      Savings: $${bestPort.savings_vs_most_expensive.toLocaleString()} vs worst option`);
                            if (analysisResult.recommendations.length > 1) {
                                console.log('\n   Other Options:');
                                analysisResult.recommendations
                                    .slice(1, 6)
                                    .forEach((rec) => {
                                    console.log(`   ${rec.rank}. ${rec.port_name.padEnd(25)} $${rec.total_cost.toLocaleString()} total`);
                                });
                            }
                        }
                    }
                    catch (error) {
                        if (enableLogging) {
                            console.warn('⚠️  Could not generate map:', error instanceof Error ? error.message : error);
                        }
                    }
                }
                break; // Exit loop
            }
            else {
                if (enableLogging) {
                    console.log(`\n⚠️  Unexpected stop_reason: ${response.stop_reason}`);
                }
                break;
            }
        }
        catch (error) {
            if (enableLogging) {
                console.error('\n❌ Error in agent loop:', error instanceof Error ? error.message : error);
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
async function askCompleteBunkerAgent(userMessage, options) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required. Please set it in your .env file.');
    }
    return runCompleteBunkerAgent(userMessage, options);
}
//# sourceMappingURL=complete-bunker-agent.js.map