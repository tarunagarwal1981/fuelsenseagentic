/**
 * LLM Factory - Tiered Model Selection
 * 
 * Provides cost-effective LLM selection based on task complexity.
 * Uses cheapest model that can handle the task effectively.
 * 
 * Tier Strategy:
 * - Simple tool calling: Gemini Flash (70% cheaper than Haiku)
 * - Complex tool calling: GPT-4o-mini (40% cheaper than Haiku)
 * - Synthesis: Claude Haiku 4.5 (best value, excellent synthesis)
 * 
 * All models fallback to Haiku 4.5 if APIs unavailable.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgentContext } from './state';

// Conditional imports - only load if API keys are available
let ChatOpenAI: any = null;
let ChatGoogleGenerativeAI: any = null;

try {
  // Try to import OpenAI (optional)
  if (process.env.OPENAI_API_KEY) {
    ChatOpenAI = require('@langchain/openai').ChatOpenAI;
  }
} catch (e) {
  console.warn('⚠️ [LLM-FACTORY] OpenAI not available, will use Haiku fallback');
}

try {
  // Try to import Google (optional)
  if (process.env.GOOGLE_API_KEY) {
    ChatGoogleGenerativeAI = require('@langchain/google-genai').ChatGoogleGenerativeAI;
  }
} catch (e) {
  console.warn('⚠️ [LLM-FACTORY] Google GenAI not available, will use Haiku fallback');
}

/**
 * Task types for LLM selection
 */
export type LLMTask = 
  | 'intent_analysis'      // Supervisor (currently uses pure logic)
  | 'simple_tool'          // Route, Weather agents (simple schemas)
  | 'complex_tool'         // Bunker agent (complex nested schemas)
  | 'synthesis';           // Finalize (complex reasoning)

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
    switch (task) {
      case 'intent_analysis':
        // Supervisor: Should use pure logic, not LLM
        // If needed in future, use Gemini Flash
        throw new Error('Intent analysis should use pure logic, not LLM');
        
      case 'simple_tool':
        // Route/Weather agents: Simple tool calling
        // Use Gemini Flash (70% cheaper than Haiku, excellent for simple tool calls)
        if (ChatGoogleGenerativeAI && process.env.GOOGLE_API_KEY) {
          console.log('🤖 [LLM-FACTORY] Using Gemini Flash for simple tool calling');
          return new ChatGoogleGenerativeAI({
            model: 'gemini-1.5-flash',
            temperature: 0,
            apiKey: process.env.GOOGLE_API_KEY,
          });
        }
        // Fallback to Haiku if Google not available
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 (fallback) for simple tool calling');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: process.env.ANTHROPIC_API_KEY!,
        });
        
      case 'complex_tool':
        // Bunker agent: Complex nested schemas
        // Use GPT-4o-mini (40% cheaper than Haiku, excellent tool calling)
        if (ChatOpenAI && process.env.OPENAI_API_KEY) {
          console.log('🤖 [LLM-FACTORY] Using GPT-4o-mini for complex tool calling');
          return new ChatOpenAI({
            model: 'gpt-4o-mini',
            temperature: 0,
            apiKey: process.env.OPENAI_API_KEY,
          });
        }
        // Fallback to Haiku if OpenAI not available
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 (fallback) for complex tool calling');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: process.env.ANTHROPIC_API_KEY!,
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
          apiKey: process.env.ANTHROPIC_API_KEY!,
        });
        
      default:
        // Default to Haiku
        console.log('🤖 [LLM-FACTORY] Using Claude Haiku 4.5 (default)');
        return new ChatAnthropic({
          model: 'claude-haiku-4-5-20251001',
          temperature: 0,
          apiKey: process.env.ANTHROPIC_API_KEY!,
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

