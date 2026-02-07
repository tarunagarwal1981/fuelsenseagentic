/**
 * LLM Response Generator
 *
 * Generates natural-language responses from synthesis data when templates
 * are not available. Context-aware: LLM receives all synthesis data and
 * produces appropriate responses based on query type and available data.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { SynthesisContext, ExtractedData } from './synthesis/auto-synthesis-engine';
import type { MultiAgentState } from './state';

/**
 * Generate response using LLM when template is not available
 *
 * CONTEXT-AWARE: LLM receives all synthesis data and generates
 * appropriate response based on query type and available data.
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

  // Build context summary for LLM
  const contextSummary = buildContextSummary(synthesis, state);

  // Create system prompt
  const systemPrompt = `You are a maritime operations assistant generating responses for FuelSense 360.

CONTEXT:
- Query Type: ${synthesis.context.query_type}
- Primary Domain: ${synthesis.context.primary_domain}
- User Intent: ${synthesis.context.query_intent}

AVAILABLE DATA:
${contextSummary}

YOUR TASK:
Generate a clear, professional response using markdown formatting.

FORMATTING REQUIREMENTS:
1. Start with a brief summary (1-2 sentences)
2. Use headings (## and ###) to organize information
3. Use **bold** for important terms and numbers
4. Use bullet points (-) for lists
5. Use tables for comparisons when appropriate
6. Keep paragraphs short (2-3 sentences max)
7. Include specific numbers and data from the context

STRUCTURE:
- For vessel queries: Summary → Fleet Composition → Details (if <10 vessels)
- For bunker queries: Summary → Recommended Port → Cost Breakdown
- For route queries: Summary → Distance/Duration → Route Details
- For comparison queries: Summary → Rankings → Recommendations

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
- Do NOT mention that you're an AI or mention templates/system errors`;

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

/**
 * Build context summary from synthesis data
 */
function buildContextSummary(
  synthesis: {
    context: SynthesisContext;
    extracted_data: ExtractedData[];
    insights: unknown[];
    recommendations: unknown[];
    warnings: unknown[];
  },
  _state: MultiAgentState
): string {
  let summary = '';

  // Group data by type
  const dataByType: Record<string, ExtractedData[]> = {};
  synthesis.extracted_data.forEach((item) => {
    if (!dataByType[item.data_type]) {
      dataByType[item.data_type] = [];
    }
    dataByType[item.data_type].push(item);
  });

  // Format each data type
  Object.entries(dataByType).forEach(([type, items]) => {
    summary += `\n## ${type.toUpperCase()} DATA:\n`;

    items.forEach((item) => {
      summary += formatDataItem(item);
    });
  });

  // Add insights if any
  if (synthesis.insights.length > 0) {
    summary += '\n## INSIGHTS:\n';
    synthesis.insights.forEach((insight) => {
      const text = typeof insight === 'object' && insight !== null && 'message' in insight
        ? String((insight as { message?: unknown }).message)
        : String(insight);
      summary += `- ${text}\n`;
    });
  }

  // Add recommendations if any
  if (synthesis.recommendations.length > 0) {
    summary += '\n## RECOMMENDATIONS:\n';
    synthesis.recommendations.forEach((rec) => {
      const text = typeof rec === 'object' && rec !== null && 'message' in rec
        ? String((rec as { message?: unknown }).message)
        : String(rec);
      summary += `- ${text}\n`;
    });
  }

  // Add warnings if any
  if (synthesis.warnings.length > 0) {
    summary += '\n## WARNINGS:\n';
    synthesis.warnings.forEach((warn) => {
      const text = typeof warn === 'object' && warn !== null && 'message' in warn
        ? String((warn as { message?: unknown }).message)
        : String(warn);
      summary += `- ${text}\n`;
    });
  }

  // Add available_data as JSON fallback when extracted_data is sparse
  const availableData = synthesis.context.available_data;
  if (Object.keys(availableData || {}).length > 0 && summary.trim().length < 200) {
    summary += '\n## RAW DATA (JSON):\n';
    summary += JSON.stringify(availableData, null, 2);
  }

  return summary || 'No structured data available. Use general maritime knowledge.';
}

/**
 * Format a single extracted data item
 */
function formatDataItem(item: ExtractedData): string {
  const valueStr =
    typeof item.field_value === 'object' && item.field_value !== null
      ? JSON.stringify(item.field_value)
      : String(item.field_value ?? '');
  return `- ${item.field_name} (${item.source_agent}, ${item.importance}): ${valueStr}\n`;
}
