/**
 * Orchestrator Agent (LLM-based)
 * 
 * The Orchestrator is the entry point for all user queries. It:
 * 1. Understands user intent
 * 2. Extracts vessel name (MANDATORY)
 * 3. Detects missing critical parameters
 * 4. Checks feature availability
 * 5. Creates execution plan
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateVesselNameToolSchema,
  executeValidateVesselNameTool,
  checkFeatureAvailabilityToolSchema,
  executeCheckFeatureAvailabilityTool,
  extractQueryParametersToolSchema,
  executeExtractQueryParametersTool,
} from '../tools/orchestrator-tools';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Query types that can be classified
 */
export type QueryType = 'bunker_planning' | 'cii_analysis' | 'eu_ets' | 'combined';

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Missing parameter information
 */
export interface MissingParameter {
  /** Parameter name */
  name: string;
  /** Parameter description */
  description: string;
  /** Example value */
  example: string;
  /** Whether this is critical (must have) */
  critical: boolean;
}

/**
 * Agent call in execution plan
 */
export interface AgentCall {
  /** Agent name */
  agent_name: string;
  /** Agent description */
  description: string;
  /** Required parameters for this agent */
  required_parameters: string[];
}

/**
 * Execution plan
 */
export interface ExecutionPlan {
  /** Workflow name */
  workflow: string;
  /** Sequence of agents to call */
  agent_sequence: AgentCall[];
}

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  /** Classified query type */
  query_type: QueryType;
  /** Whether vessel was identified */
  vessel_identified: boolean;
  /** Vessel name (or null if not found) */
  vessel_name: string | null;
  /** Missing critical parameters */
  missing_parameters: MissingParameter[];
  /** Execution plan (if all required data is available) */
  execution_plan?: ExecutionPlan;
  /** Whether user prompt is required */
  user_prompt_required: boolean;
  /** User prompt message (if prompt required) */
  user_prompt_message?: string;
  /** Raw LLM response for debugging */
  raw_response?: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Claude model to use (default: claude-sonnet-4-5-20250514) */
  model?: string;
  /** Temperature (default: 0.0 for deterministic) */
  temperature?: number;
  /** Maximum tokens (default: 4000) */
  maxTokens?: number;
  /** Maximum iterations (default: 10) */
  maxIterations?: number;
  /** Enable logging (default: true) */
  enableLogging?: boolean;
  /** System prompt file path (default: config/prompts/orchestrator.txt) */
  systemPromptPath?: string;
}

/**
 * Orchestrator interface
 */
export interface Orchestrator {
  /**
   * Analyze user query and create orchestration result
   */
  analyze(params: {
    user_query: string;
    conversation_history?: Message[];
  }): Promise<OrchestrationResult>;
}

// ============================================================================
// ORCHESTRATOR IMPLEMENTATION
// ============================================================================

/**
 * Orchestrator Agent Implementation
 */
export class OrchestratorAgent implements Orchestrator {
  private config: Required<OrchestratorConfig>;
  private anthropic: Anthropic;
  private systemPrompt: string;

  constructor(config: OrchestratorConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-5-20250514',
      temperature: config.temperature ?? 0.0,
      maxTokens: config.maxTokens ?? 4000,
      maxIterations: config.maxIterations ?? 10,
      enableLogging: config.enableLogging ?? true,
      systemPromptPath: config.systemPromptPath || 'config/prompts/orchestrator.txt',
    };

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });

    // Load system prompt
    this.systemPrompt = this.loadSystemPrompt();
  }

  /**
   * Load system prompt from file
   */
  private loadSystemPrompt(): string {
    try {
      // Resolve path relative to project root
      const projectRoot = process.cwd();
      const promptPath = path.resolve(projectRoot, this.config.systemPromptPath);
      
      if (!fs.existsSync(promptPath)) {
        throw new Error(`System prompt file not found: ${promptPath}`);
      }

      const prompt = fs.readFileSync(promptPath, 'utf-8');
      
      if (this.config.enableLogging) {
        console.log(`[ORCHESTRATOR] Loaded system prompt from ${promptPath}`);
      }

      return prompt;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ORCHESTRATOR] Failed to load system prompt: ${errorMessage}`);
      
      // Return default prompt as fallback
      return 'You are the Orchestrator Agent for FuelSense 360. Analyze user queries, extract vessel information, detect missing parameters, and create execution plans.';
    }
  }

  /**
   * Logging utility
   */
  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ORCHESTRATOR] ${message}`);
      if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Analyze user query and create orchestration result
   */
  async analyze(params: {
    user_query: string;
    conversation_history?: Message[];
  }): Promise<OrchestrationResult> {
    const { user_query, conversation_history = [] } = params;

    this.log('Starting orchestration analysis', { user_query });

    let messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: user_query,
      },
    ];

    // Add conversation history if provided
    if (conversation_history.length > 0) {
      const historyMessages: Anthropic.MessageParam[] = conversation_history.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      messages = [...historyMessages, ...messages];
    }

    let toolCalls = 0;
    let rawResponse = '';

    // Agentic loop: continue until we get a final text response
    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      this.log(`Iteration ${iteration + 1}/${this.config.maxIterations}`);

      try {
        // Call Claude with system prompt and tools
        const response = await this.anthropic.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: this.systemPrompt,
          messages,
          tools: [
            {
              name: validateVesselNameToolSchema.name,
              description: validateVesselNameToolSchema.description,
              input_schema: validateVesselNameToolSchema.input_schema,
            },
            {
              name: checkFeatureAvailabilityToolSchema.name,
              description: checkFeatureAvailabilityToolSchema.description,
              input_schema: checkFeatureAvailabilityToolSchema.input_schema,
            },
            {
              name: extractQueryParametersToolSchema.name,
              description: extractQueryParametersToolSchema.description,
              input_schema: extractQueryParametersToolSchema.input_schema,
            },
          ],
        });

        this.log('Claude response received', {
          stopReason: response.stop_reason,
          contentLength: response.content.length,
        });

        // Check if Claude wants to use a tool
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ContentBlock & { type: 'tool_use' } =>
            block.type === 'tool_use'
        );

        if (toolUseBlocks.length > 0) {
          // Handle tool calls
          for (const toolUseBlock of toolUseBlocks) {
            toolCalls++;
            
            this.log(`Tool use requested: ${toolUseBlock.name}`, {
              toolUseId: toolUseBlock.id,
              input: toolUseBlock.input,
            });

            // Execute the requested tool
            let toolResult: any;
            let toolError: string | null = null;

            try {
              if (toolUseBlock.name === 'validate_vessel_name') {
                toolResult = await executeValidateVesselNameTool(toolUseBlock.input);
              } else if (toolUseBlock.name === 'check_feature_availability') {
                toolResult = await executeCheckFeatureAvailabilityTool(toolUseBlock.input);
              } else if (toolUseBlock.name === 'extract_query_parameters') {
                toolResult = await executeExtractQueryParametersTool(toolUseBlock.input);
              } else {
                toolError = `Unknown tool: ${toolUseBlock.name}`;
              }
            } catch (error) {
              toolError = error instanceof Error ? error.message : 'Unknown error occurred';
              this.log('Tool execution failed', { error: toolError });
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
          }

          // Continue the loop to get Claude's response to the tool results
          continue;
        }

        // Claude provided a text response (no tool use)
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        if (textBlocks.length > 0) {
          rawResponse = textBlocks.map(block => block.text).join('\n');
          
          this.log('Final response received', {
            responseLength: rawResponse.length,
            toolCalls,
          });

          // Parse the response to extract structured data
          // The LLM should return JSON or structured text that we can parse
          return this.parseOrchestrationResult(rawResponse, user_query);
        }

        // No text response and no tool use - unexpected
        this.log('Unexpected response: no text and no tool use', {
          stopReason: response.stop_reason,
        });
        
        return this.createErrorResult('Unexpected response from LLM');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('Error during orchestration', { error: errorMessage });
        
        return this.createErrorResult(`Error: ${errorMessage}`);
      }
    }

    // Max iterations reached
    this.log('Max iterations reached', { iterations: this.config.maxIterations });
    return this.createErrorResult('Max iterations reached - orchestration timed out');
  }

  /**
   * Parse orchestration result from LLM response
   * 
   * The LLM should return structured JSON or text that we can parse.
   * For now, we'll extract what we can and use heuristics.
   */
  private parseOrchestrationResult(
    response: string,
    userQuery: string
  ): OrchestrationResult {
    // Try to extract JSON from the response
    let parsed: any = null;
    
    // Look for JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // JSON parsing failed, continue with text parsing
      }
    }

    // If we have parsed JSON, use it
    if (parsed) {
      return {
        query_type: parsed.query_type || 'bunker_planning',
        vessel_identified: parsed.vessel_identified || false,
        vessel_name: parsed.vessel_name || null,
        missing_parameters: parsed.missing_parameters || [],
        execution_plan: parsed.execution_plan,
        user_prompt_required: parsed.user_prompt_required || false,
        user_prompt_message: parsed.user_prompt_message,
        raw_response: response,
      };
    }

    // Fallback: Use heuristics to extract information
    return this.parseOrchestrationResultHeuristic(response, userQuery);
  }

  /**
   * Parse orchestration result using heuristics (fallback)
   */
  private parseOrchestrationResultHeuristic(
    response: string,
    userQuery: string
  ): OrchestrationResult {
    // Extract vessel name
    const vesselNameMatch = userQuery.match(/(?:MV|MS|M\/V|M\/S|SS)\s+([A-Za-z0-9\s]+)/i) ||
      userQuery.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:vessel|ship)/i);
    const vesselName = vesselNameMatch ? vesselNameMatch[1].trim() : null;

    // Determine query type from keywords
    let queryType: QueryType = 'bunker_planning';
    const lowerQuery = userQuery.toLowerCase();
    if (lowerQuery.includes('cii') || lowerQuery.includes('carbon intensity')) {
      queryType = 'cii_analysis';
    } else if (lowerQuery.includes('eu ets') || lowerQuery.includes('emissions trading')) {
      queryType = 'eu_ets';
    } else if (
      (lowerQuery.includes('bunker') || lowerQuery.includes('fuel')) &&
      (lowerQuery.includes('cii') || lowerQuery.includes('ets'))
    ) {
      queryType = 'combined';
    }

    // Check for missing parameters
    const missingParameters: MissingParameter[] = [];
    
    if (!vesselName) {
      missingParameters.push({
        name: 'vessel_name',
        description: 'Vessel name',
        example: 'MV Evergreen',
        critical: true,
      });
    }

    if (!userQuery.match(/\d+\s*knots?/i)) {
      missingParameters.push({
        name: 'speed_knots',
        description: 'Vessel speed in knots',
        example: '14 knots',
        critical: true,
      });
    }

    if (!userQuery.match(/\d+\s*MT\/day\s*VLSFO/i)) {
      missingParameters.push({
        name: 'consumption_vlsfo_per_day',
        description: 'VLSFO consumption in MT/day',
        example: '35 MT/day VLSFO',
        critical: true,
      });
    }

    // Generate user prompt if needed
    const userPromptRequired = missingParameters.length > 0;
    let userPromptMessage: string | undefined;

    if (userPromptRequired) {
      userPromptMessage = this.generateUserPrompt(vesselName || 'your vessel', missingParameters);
    }

    return {
      query_type: queryType,
      vessel_identified: !!vesselName,
      vessel_name: vesselName,
      missing_parameters: missingParameters,
      execution_plan: userPromptRequired ? undefined : this.createDefaultExecutionPlan(queryType),
      user_prompt_required: userPromptRequired,
      user_prompt_message: userPromptMessage,
      raw_response: response,
    };
  }

  /**
   * Generate user prompt message
   */
  private generateUserPrompt(
    vesselName: string,
    missingParameters: MissingParameter[]
  ): string {
    const criticalParams = missingParameters.filter(p => p.critical);
    
    if (criticalParams.length === 0) {
      return '';
    }

    let prompt = `I need the following information to plan bunkers for ${vesselName}:\n\n`;
    
    criticalParams.forEach((param, index) => {
      const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][index] || `${index + 1}.`;
      prompt += `${emoji} ${param.description}:\n`;
      prompt += `Example: '${param.example}'\n\n`;
    });

    prompt += 'Please provide these details and I\'ll create a comprehensive bunker plan.';

    return prompt;
  }

  /**
   * Create default execution plan
   */
  private createDefaultExecutionPlan(queryType: QueryType): ExecutionPlan {
    const plans: Record<QueryType, ExecutionPlan> = {
      bunker_planning: {
        workflow: 'bunker_optimization',
        agent_sequence: [
          {
            agent_name: 'route_agent',
            description: 'Calculate optimal route',
            required_parameters: ['origin_port_code', 'destination_port_code'],
          },
          {
            agent_name: 'bunker_agent',
            description: 'Find optimal bunker options',
            required_parameters: ['vessel_name', 'fuel_quantity', 'route_data'],
          },
        ],
      },
      cii_analysis: {
        workflow: 'cii_analysis',
        agent_sequence: [
          {
            agent_name: 'route_agent',
            description: 'Calculate route for CII analysis',
            required_parameters: ['origin_port_code', 'destination_port_code'],
          },
          {
            agent_name: 'cii_agent',
            description: 'Calculate CII rating',
            required_parameters: ['vessel_name', 'route_data', 'consumption_data'],
          },
        ],
      },
      eu_ets: {
        workflow: 'eu_ets_calculation',
        agent_sequence: [
          {
            agent_name: 'route_agent',
            description: 'Calculate route for EU ETS',
            required_parameters: ['origin_port_code', 'destination_port_code'],
          },
          {
            agent_name: 'eu_ets_agent',
            description: 'Calculate EU ETS emissions',
            required_parameters: ['vessel_name', 'route_data', 'consumption_data'],
          },
        ],
      },
      combined: {
        workflow: 'combined_analysis',
        agent_sequence: [
          {
            agent_name: 'route_agent',
            description: 'Calculate route',
            required_parameters: ['origin_port_code', 'destination_port_code'],
          },
          {
            agent_name: 'bunker_agent',
            description: 'Find optimal bunker options',
            required_parameters: ['vessel_name', 'fuel_quantity', 'route_data'],
          },
          {
            agent_name: 'cii_agent',
            description: 'Calculate CII rating',
            required_parameters: ['vessel_name', 'route_data', 'consumption_data'],
          },
        ],
      },
    };

    return plans[queryType];
  }

  /**
   * Create error result
   */
  private createErrorResult(errorMessage: string): OrchestrationResult {
    return {
      query_type: 'bunker_planning',
      vessel_identified: false,
      vessel_name: null,
      missing_parameters: [],
      user_prompt_required: true,
      user_prompt_message: `I encountered an error: ${errorMessage}. Please try rephrasing your query or contact support.`,
      raw_response: errorMessage,
    };
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE FACTORY
// ============================================================================

/**
 * Create orchestrator agent instance
 */
export function createOrchestratorAgent(
  config: OrchestratorConfig
): OrchestratorAgent {
  return new OrchestratorAgent(config);
}

