/**
 * LLM Factory - Tiered Model Selection
 * 
 * Provides cost-effective LLM selection based on task complexity.
 * Uses cheapest model that can handle the task effectively.
 * 
 * Conservative Tier Strategy:
 * - Simple tool calling (Route/Weather): GPT-4o-mini (40% cheaper than Haiku, proven tool calling)
 * - Complex tool calling (Bunker): Claude Haiku 4.5 (keep current for reliability)
 * - Synthesis (Finalize): Claude Haiku 4.5 (best value, excellent synthesis)
 * 
 * All models fallback to Haiku 4.5 if APIs unavailable.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgentContext } from './state';

// Lazy load OpenAI to avoid build-time module resolution issues
let ChatOpenAI: any = null;

function getChatOpenAI() {
  if (!ChatOpenAI) {
    try {
      // Use require for runtime loading (works in Node.js and Edge runtime)
      const openaiModule = require('@langchain/openai');
      ChatOpenAI = openaiModule.ChatOpenAI;
    } catch (error) {
      console.warn('⚠️ [LLM-FACTORY] @langchain/openai not available, will fallback to Claude');
      return null;
    }
  }
  return ChatOpenAI;
}

/**
 * Task types for LLM selection
 */
export type LLMTask = 
  | 'intent_analysis'      // Supervisor (currently uses pure logic)
  | 'supervisor_planning'  // Supervisor orchestration decisions
  | 'simple_tool'          // Route, Weather agents (simple schemas)
  | 'complex_tool'         // Bunker agent (complex nested schemas)
  | 'synthesis'            // Finalize (complex reasoning)
  | 'reasoning';           // Agentic supervisor ReAct reasoning

/**
 * LLM Factory for tiered model selection
 */
export class LLMFactory {
  /**
   * Get appropriate LLM for task
   * Tiered approach: Cheapest model that can handle the task
   * 
   * @param task - The task type
   * @param context - Optional agent context for complexity assessment
   * @returns BaseChatModel instance
   */
  static getLLMForTask(
    task: LLMTask,
    context?: AgentContext
  ): BaseChatModel {
    // Validate API key FIRST - check for undefined, null, and empty string
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set or is empty. Please configure it in Netlify environment variables.'
      );
    }
    
    switch (task) {
      case 'intent_analysis':
        // Supervisor: Should use pure logic, not LLM
        // If needed in future, use Gemini Flash
        throw new Error('Intent analysis should use pure logic, not LLM');
        
      case 'supervisor_planning':
        // Supervisor: Orchestration and tool allocation decisions
        // Prefer Claude for reliability, GPT-4o-mini optional via PREFER_OPENAI_PLANNING
        const preferOpenAIPlanning = process.env.PREFER_OPENAI_PLANNING === 'true';
        
        if (preferOpenAIPlanning) {
          const OpenAIPlanning = getChatOpenAI();
          if (OpenAIPlanning && process.env.OPENAI_API_KEY) {
            console.log('🤖 [LLM-FACTORY] Using GPT-4o-mini for supervisor planning');
            return new OpenAIPlanning({
              model: 'gpt-4o-mini',
              temperature: 0,
              apiKey: process.env.OPENAI_API_KEY,
            });
          }
        }
        
        // Default: Use Claude Haiku for supervisor planning (reliable)
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for supervisor planning');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: apiKey,
        });
        
      case 'simple_tool':
        // Route/Weather agents: Simple tool calling
        // Use GPT-4o-mini (40% cheaper than Haiku, excellent tool calling)
        const OpenAI = getChatOpenAI();
        if (OpenAI && process.env.OPENAI_API_KEY) {
          console.log('🤖 [LLM-FACTORY] Using GPT-4o-mini for simple tool calling (Route/Weather agents)');
          return new OpenAI({
            model: 'gpt-4o-mini',
            temperature: 0,
            apiKey: process.env.OPENAI_API_KEY,
          });
        }
        
        // Fallback to Haiku if OpenAI unavailable
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for simple tool calling (fallback - OpenAI unavailable)');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: apiKey,
        });
        
      case 'complex_tool':
        // Bunker agent: Complex nested schemas
        // Keep on Claude Haiku 4.5 for reliability (conservative approach)
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for complex tool calling (Bunker agent)');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: apiKey,
        });
        
      case 'synthesis':
        // Finalize: Complex reasoning and synthesis
        // Use Haiku 4.5 for all complexity levels (best value, excellent synthesis)
        const complexity = context?.finalize?.complexity || 'medium';
        const temperature = complexity === 'high' ? 0.2 : 0.3;
        console.log(`🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for synthesis (complexity: ${complexity})`);
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature,
          apiKey: apiKey,
        });
        
      case 'reasoning':
        // Agentic Supervisor: ReAct pattern reasoning
        // Prefer Claude for reasoning (more reliable, no quota issues in testing)
        // GPT-4o can be used if PREFER_OPENAI_REASONING=true
        const preferOpenAI = process.env.PREFER_OPENAI_REASONING === 'true';
        
        if (preferOpenAI) {
          const OpenAIReasoning = getChatOpenAI();
          if (OpenAIReasoning && process.env.OPENAI_API_KEY) {
            console.log('🤖 [LLM-FACTORY] Using GPT-4o for agentic reasoning');
            return new OpenAIReasoning({
              model: 'gpt-4o',
              temperature: 0.7,  // Slightly creative for problem-solving
              apiKey: process.env.OPENAI_API_KEY,
            });
          }
        }
        
        // Default: Use Claude Haiku for reasoning (reliable, cost-effective)
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for agentic reasoning');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0.5,
          apiKey: apiKey,
        });
        
      default:
        // Default to Haiku
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 (default)');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: apiKey,
        });
    }
  }
  
  /**
   * Get LLM for specific agent
   * 
   * @param agentName - The agent name
   * @param context - Optional agent context
   * @returns BaseChatModel instance
   */
  static getLLMForAgent(
    agentName: 'route_agent' | 'weather_agent' | 'bunker_agent' | 'finalize',
    context?: AgentContext
  ): BaseChatModel {
    switch (agentName) {
      case 'route_agent':
      case 'weather_agent':
        return this.getLLMForTask('simple_tool', context);
      case 'bunker_agent':
        return this.getLLMForTask('complex_tool', context);
      case 'finalize':
        return this.getLLMForTask('synthesis', context);
      default:
        return this.getLLMForTask('simple_tool', context);
    }
  }
}

