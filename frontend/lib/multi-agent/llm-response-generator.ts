/**
 * LLM Response Generator
 *
 * Generates natural-language responses from synthesis data when templates
 * are not available. Context-aware: LLM receives all synthesis data and
 * produces appropriate responses based on query type and available data.
 *
 * Uses Context Builder for compact, token-bounded summaries when LLM_FIRST_SYNTHESIS is enabled.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { SynthesisContext, ExtractedData } from './synthesis/auto-synthesis-engine';
import type { MultiAgentState } from './state';
import { buildCompactContext } from './synthesis/context-builder';

/**
 * Generate response using LLM when template is not available
 *
 * CONTEXT-AWARE: LLM receives all synthesis data and generates
 * appropriate response based on query type and available data.
 * INTENT-AWARE: Interprets user query to decide level of detail (full list vs count, filter by type, etc.).
 */
export async function generateLLMResponse(
  synthesis: {
    context: SynthesisContext;
    extracted_data: ExtractedData[];
    insights: unknown[];
    recommendations: unknown[];
    warnings: unknown[];
  },
  state: MultiAgentState
): Promise<string> {
  console.log('🤖 [LLM-RESPONSE-GEN] Generating response for query type:', synthesis.context.query_type);

  // Build context using Context Builder (compact, token-bounded summaries)
  const contextSummary = buildCompactContext(synthesis, state);

  const matchedIntent = synthesis.context.routing_metadata?.matched_intent ?? '';

  // Create system prompt with intent-aware instructions
  const systemPrompt = `You are a maritime operations assistant generating responses for FuelSense 360.

CONTEXT:
- Query Type: ${synthesis.context.query_type}
- Primary Domain: ${synthesis.context.primary_domain}
- User Intent: ${synthesis.context.query_intent}
- Matched Intent: ${matchedIntent}

AVAILABLE DATA:
${contextSummary}

YOUR TASK:
Generate a clear, professional response using markdown formatting.

INTENT-AWARE RESPONSE:
Interpret the user's query to decide what to show:
- If they asked for a list of vessels: include all vessel names (or a reasonable subset if very large)
- If they asked "how many": show only the count/summary
- If they asked for vessels of a type (e.g. bulk carriers): filter and show only those
- If they asked for vessels in a DWT range: filter by deadweight
- Use ALL relevant data provided. Do not truncate lists arbitrarily. Match the level of detail to what the user asked.

FORMATTING REQUIREMENTS:
1. Start with a brief summary (1-2 sentences)
2. Use headings (## and ###) to organize information
3. Use **bold** for important terms and numbers
4. Use bullet points (-) for lists
5. Use tables for comparisons when appropriate
6. Keep paragraphs short (2-3 sentences max)
7. Include specific numbers and data from the context
8. Use ONLY markdown syntax. Do NOT use HTML tags or angle brackets (<>). For comparisons use words (e.g. "less than") instead of symbols.

TONE:
- Professional and concise
- Data-driven (cite specific numbers)
- Actionable (provide clear recommendations when appropriate)

LENGTH: 200-400 words maximum

IMPORTANT:
- Use ALL relevant data provided in context
- Format numbers with commas (e.g., 1,234 not 1234)
- Include units (MT, NM, USD, etc.)
- Do NOT say "based on the data provided" - just present the information
- Do NOT mention that you're an AI or mention templates/system errors
- Output plain markdown only (no HTML, no < or > tags). Use markdown for all formatting.`;

  // Get original user query
  const userQuery = state.messages?.[0]?.content?.toString() || 'Provide information';

  // Call LLM
  const llm = new ChatAnthropic({
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.3,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Original query: "${userQuery}"\n\nGenerate response using the data provided in the system context.`
    ),
  ]);

  return response.content.toString();
}
