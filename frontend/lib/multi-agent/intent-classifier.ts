/**
 * Intent Classifier Service
 *
 * Maps user queries to agent IDs using GPT-4o-mini with Redis caching.
 * Fallback to null triggers pattern matcher backup when classification fails.
 */

import { createHash } from 'crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { LLMFactory } from './llm-factory';
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
  /** Extracted parameters from the query (e.g., ports, vessel names) */
  extracted_params: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

const INTENT_CACHE_PREFIX = 'fuelsense:intent:';
const INTENT_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// ============================================================================
// Cache Key
// ============================================================================

function getQueryHash(query: string): string {
  const normalized = query.toLowerCase().trim().substring(0, 500);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

// ============================================================================
// Agent List Builder
// ============================================================================

function buildAgentListWithIntents(): string | null {
  const registry = AgentRegistry.getInstance();
  const agents = registry
    .getAll()
    .filter((a) => a.enabled && a.type !== 'supervisor')
    .map(
      (a) =>
        `- ${a.id}: ${(a.intents as string[] | undefined)?.join(', ') || 'general'}`
    );

  if (agents.length === 0) {
    return null;
  }

  return agents.join('\n');
}

// ============================================================================
// LLM Classification
// ============================================================================

async function classifyWithLLM(
  query: string,
  agentList: string,
  correlationId: string
): Promise<IntentClassification | null> {
  if (!agentList) return null;
  const llm = LLMFactory.getLLMForTask('intent_classification');
  const systemPrompt = `You are an intent classifier for FuelSense 360, a maritime bunker planning system.

Map the user query to exactly ONE agent ID. Choose the agent that best handles the query.

Available agents (agent_id: intents):
${agentList}

Respond with a JSON object only, no markdown or extra text:
{
  "agent_id": "<agent_id>",
  "intent": "<matched intent string>",
  "confidence": <0-1 number>,
  "reasoning": "<brief explanation>",
  "extracted_params": { "<key>": "<value>" }
}

If the query is ambiguous or unclear, use confidence < 0.6. Valid agent IDs must be from the list above.`;

  const userPrompt = `Query: "${query}"`;

  try {
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    // Extract JSON from response (handle wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        formatLogWithCorrelation(correlationId, 'Intent classifier: no JSON in response', {
          contentPreview: content.substring(0, 200),
        })
      );
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as IntentClassification;

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

    return {
      agent_id: String(parsed.agent_id),
      intent: String(parsed.intent),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      reasoning: String(parsed.reasoning ?? ''),
      extracted_params:
        parsed.extracted_params && typeof parsed.extracted_params === 'object'
          ? parsed.extracted_params
          : {},
    };
  } catch (error) {
    console.error(
      formatLogWithCorrelation(correlationId, 'Intent classifier: LLM error', {
        error: error instanceof Error ? error.message : String(error),
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
   * @param options - Optional cache override and correlation ID
   * @returns IntentClassification or null (fallback to pattern matcher)
   */
  static async classify(
    query: string,
    options?: {
      cache?: RedisCache;
      correlationId?: string;
      skipCache?: boolean;
    }
  ): Promise<IntentClassification | null> {
    const startTime = Date.now();
    const correlationId =
      options?.correlationId || getCorrelationId() || 'unknown';
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
            correlation_id: correlationId,
            query,
            query_hash: queryHash,
            classification_method: 'llm_intent_classifier',
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
            formatLogWithCorrelation(correlationId, 'Intent classifier: cache hit', {
              cache_key: cacheKey,
              agent_id: cached.agent_id,
            })
          );
          return cached;
        }
      } catch (e) {
        console.warn(
          formatLogWithCorrelation(correlationId, 'Intent classifier: cache get failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }

    // Cache miss: get agent list and call LLM
    const agentList = buildAgentListWithIntents();
    if (!agentList) {
      console.warn(
        formatLogWithCorrelation(correlationId, 'Intent classifier: no agents in registry, fallback to pattern matcher')
      );
      return null;
    }
    const result = await classifyWithLLM(query, agentList, correlationId);

    if (!result) {
      console.warn(
        formatLogWithCorrelation(correlationId, 'Intent classifier: LLM returned null, fallback to pattern matcher')
      );
      return null;
    }

    // Cache result
    if (cache) {
      try {
        await cache.set(cacheKey, result, INTENT_CACHE_TTL);
      } catch (e) {
        console.warn(
          formatLogWithCorrelation(correlationId, 'Intent classifier: cache set failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }

    const latencyMs = Date.now() - startTime;
    logIntentClassification({
      correlation_id: correlationId,
      query,
      query_hash: queryHash,
      classification_method: 'llm_intent_classifier',
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
      formatLogWithCorrelation(correlationId, 'Intent classifier: classified', {
        agent_id: result.agent_id,
        intent: result.intent,
        confidence: result.confidence,
      })
    );

    return result;
  }
}
