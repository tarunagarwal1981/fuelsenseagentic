/**
 * Intent Classifier Service
 *
 * Maps user queries to agent IDs using GPT-4o-mini with Redis caching.
 * LLM fallback for ambiguous queries when pattern matcher cannot route.
 * Returns null on failure to allow fallback to pattern matcher.
 */

import { createHash } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentRegistry } from './registry';
import { LLMFactory } from './llm-factory';
import { SupervisorPromptGenerator } from './supervisor-prompt-generator';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { formatLogWithCorrelation } from '@/lib/utils/correlation';
import { logIntentClassification } from '@/lib/monitoring/intent-classification-logger';
import type { RedisCache } from '@/lib/repositories/cache-client';

/** Rough cost estimate for GPT-4o-mini classification (~500 input + 100 output tokens) */
const ESTIMATED_CLASSIFICATION_COST_USD = 0.0001;

// ============================================================================
// Types
// ============================================================================

export interface IntentClassification {
  /** The agent ID to route to */
  agent_id: string;
  /** Matched intent from agent's intents */
  intent: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Brief reasoning for the classification */
  reasoning: string;
  /** Classification method used */
  classification_method: 'llm_gpt4o_mini';
  /** Extracted parameters from the query (e.g., ports, vessel names) */
  extracted_params?: {
    vessel_name?: string;
    origin_port?: string;
    destination_port?: string;
    date?: string;
    [key: string]: string | undefined;
  };
  /** Latency of classification in ms (populated by classifier) */
  latency_ms?: number;
  /** Whether result came from cache */
  cache_hit?: boolean;
  /** Cost of classification in USD */
  cost_usd?: number;
  /** Query hash for cache lookup */
  query_hash?: string;
}

// ============================================================================
// Constants
// ============================================================================

const INTENT_CACHE_PREFIX = 'fuelsense:intent:';
const INTENT_CACHE_TTL = 604800; // 7 days in seconds

// ============================================================================
// Cache Key
// ============================================================================

function getQueryHash(query: string): string {
  const normalized = query.toLowerCase().trim().substring(0, 500);
  return createHash('sha256').update(normalized).digest('hex');
}

// ============================================================================
// Agent List Builder
// ============================================================================

function buildAgentListWithIntents(): string | null {
  const agents = AgentRegistry.getAllAgents();
  if (agents.length === 0) return null;

  return agents
    .map(
      (a) =>
        `- ${a.agent_name}: ${a.description} (tools: ${a.available_tools.map((t) => t.tool_name).join(', ')})`
    )
    .join('\n');
}

// ============================================================================
// LLM Classification
// ============================================================================

async function classifyWithLLM(
  query: string,
  agentList: string,
  basePrompt: string,
  correlationId: string
): Promise<IntentClassification | null> {
  if (!agentList) return null;

  const llm = LLMFactory.getLLMForTask('intent_classification');
  const systemPrompt = `${basePrompt}

## AGENTS WITH INTENTS

${agentList}

## ROUTING RULES (follow these for correct multi-step workflows)

**Vessel-related queries — choose the agent that fulfills the user's goal:**

1. **Hull / performance / fouling (single vessel)**: User asks for hull performance, hull condition, fouling, excess power, speed loss, or a hull/performance report for a vessel (by name or IMO). Return **hull_performance_agent**. Do NOT return entity_extractor; the system runs entity extraction first when vessel identifiers are missing.

2. **Fleet list / catalog / count (no specific vessel)**: User asks for a list of vessels, fleet list, vessel count, "which vessels we have", "show all ships", fleet composition, vessel catalog, or similar. There is no vessel name or IMO to extract from the query. Return **vessel_info_agent** so it can fetch the list. Do NOT return entity_extractor for these.

3. **Specific vessel info (name or IMO in query, no hull)**: User asks about one vessel by name or IMO — e.g. status, ROB, noon report, position, vessel details — without hull/performance/fouling. Return **entity_extractor** so the system extracts the vessel identifier first; it will then route to vessel_info_agent (or others) as needed.

4. **Route / weather / bunker / compliance**: Use the agent that directly fulfills the query (route_agent, weather_agent, bunker_agent, compliance_agent) per the AGENTS WITH INTENTS list above.

**Rule of thumb:** Use **entity_extractor** only when the user mentions a *specific* vessel (name or IMO) and we need to extract it from the query. Use **vessel_info_agent** when the user wants a list/count/catalog or data that vessel_info_agent fetches (list, specs, noon report, consumption). Use **hull_performance_agent** for any hull/performance/fouling request.

You are a routing classifier. Map this query to ONE agent ID (the agent that fulfills the user's goal). Respond ONLY with JSON (no markdown code blocks):
{
  "agent_id": "<agent_id>",
  "intent": "<matched intent string>",
  "confidence": <0-1 number>,
  "reasoning": "<brief explanation>",
  "extracted_params": { "vessel_name": "...", "origin_port": "...", "destination_port": "...", "date": "..." }
}

Valid agent IDs must be from the list above. If ambiguous, use confidence < 0.6.`;

  const userPrompt = `Query: "${query}"`;

  const llmStart = Date.now();
  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    const latencyMs = Date.now() - llmStart;

    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Validate required fields
    if (
      !parsed.agent_id ||
      typeof parsed.intent !== 'string' ||
      typeof parsed.confidence !== 'number'
    ) {
      console.warn(
        formatLogWithCorrelation(correlationId, 'Intent classifier: invalid response shape', {
          parsed,
        })
      );
      return null;
    }

    // Normalize extracted_params
    let extractedParams: IntentClassification['extracted_params'] = undefined;
    if (parsed.extracted_params && typeof parsed.extracted_params === 'object') {
      const raw = parsed.extracted_params as Record<string, unknown>;
      extractedParams = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') extractedParams[k] = v;
      }
    }

    return {
      agent_id: String(parsed.agent_id),
      intent: String(parsed.intent),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      reasoning: String(parsed.reasoning ?? ''),
      classification_method: 'llm_gpt4o_mini',
      extracted_params:
        Object.keys(extractedParams ?? {}).length > 0 ? extractedParams : undefined,
    };
  } catch (error) {
    const latencyMs = Date.now() - llmStart;
    console.error(
      formatLogWithCorrelation(correlationId, 'Intent classifier: LLM error', {
        error: error instanceof Error ? error.message : String(error),
        latency_ms: latencyMs,
      })
    );
    return null;
  }
}

// ============================================================================
// IntentClassifier
// ============================================================================

/**
 * Intent classifier that maps queries to agent IDs using LLM with Redis caching.
 * Returns null on error or cache miss with LLM failure (triggers pattern matcher backup).
 */
export class IntentClassifier {
  /**
   * Classify a user query to an agent ID.
   * Uses Redis cache (7-day TTL) on cache hit; otherwise calls GPT-4o-mini.
   *
   * @param query - User query string
   * @param correlationId - Correlation ID for request tracing (defaults to getCorrelationId() or 'unknown')
   * @param options - Optional cache override and skip cache
   * @returns IntentClassification or null (fallback to pattern matcher)
   */
  static async classify(
    query: string,
    correlationId?: string,
    options?: {
      cache?: RedisCache;
      skipCache?: boolean;
    }
  ): Promise<IntentClassification | null> {
    const startTime = Date.now();
    const effectiveCorrelationId = correlationId ?? getCorrelationId() ?? 'unknown';
    const cache =
      options?.cache ?? (ServiceContainer.getInstance().getCache() as RedisCache);
    const skipCache = options?.skipCache ?? false;

    const cacheKey = `${INTENT_CACHE_PREFIX}${getQueryHash(query)}`;
    const queryHash = getQueryHash(query);

    // Check cache first
    if (cache && !skipCache) {
      try {
        const cached = await cache.get<IntentClassification>(cacheKey);
        if (cached) {
          const latencyMs = Date.now() - startTime;
          logIntentClassification({
            correlation_id: effectiveCorrelationId,
            query,
            query_hash: queryHash,
            classification_method: 'llm_gpt4o_mini',
            matched_agent: cached.agent_id,
            matched_intent: cached.intent,
            confidence: cached.confidence * 100,
            reasoning: cached.reasoning,
            cache_hit: true,
            latency_ms: latencyMs,
            cost_usd: 0,
            timestamp: Date.now(),
          });
          console.log(
            formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: cache hit', {
              cache_key: cacheKey,
              agent_id: cached.agent_id,
              latency_ms: latencyMs,
            })
          );
          return { ...cached, latency_ms: latencyMs, cache_hit: true, cost_usd: 0, query_hash: queryHash };
        }
      } catch (e) {
        console.warn(
          formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: cache get failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }

    // Cache miss: build prompt and call LLM
    const basePrompt = SupervisorPromptGenerator.generateSimplifiedPrompt();
    const agentList = buildAgentListWithIntents();
    if (!agentList) {
      console.warn(
        formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: no agents in registry, fallback to pattern matcher')
      );
      return null;
    }

    const result = await classifyWithLLM(query, agentList, basePrompt, effectiveCorrelationId);

    if (!result) {
      console.warn(
        formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: LLM returned null, fallback to pattern matcher')
      );
      return null;
    }

    // Cache result
    if (cache) {
      try {
        await cache.set(cacheKey, result, INTENT_CACHE_TTL);
      } catch (e) {
        console.warn(
          formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: cache set failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }

    const latencyMs = Date.now() - startTime;
    logIntentClassification({
      correlation_id: effectiveCorrelationId,
      query,
      query_hash: queryHash,
      classification_method: 'llm_gpt4o_mini',
      matched_agent: result.agent_id,
      matched_intent: result.intent,
      confidence: result.confidence * 100,
      reasoning: result.reasoning,
      cache_hit: false,
      latency_ms: latencyMs,
      cost_usd: ESTIMATED_CLASSIFICATION_COST_USD,
      timestamp: Date.now(),
    });

    console.log(
      formatLogWithCorrelation(effectiveCorrelationId, 'Intent classifier: classified', {
        agent_id: result.agent_id,
        intent: result.intent,
        confidence: result.confidence,
        latency_ms: latencyMs,
      })
    );

    return {
      ...result,
      latency_ms: latencyMs,
      cache_hit: false,
      cost_usd: ESTIMATED_CLASSIFICATION_COST_USD,
      query_hash: queryHash,
    };
  }
}
