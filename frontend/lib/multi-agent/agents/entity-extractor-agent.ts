/**
 * Entity Extractor Agent
 *
 * Extracts vessel identifiers (names and IMO numbers) from user queries using LLM.
 * This is a lightweight agent that runs early in the pipeline to identify
 * which vessels the user is asking about.
 *
 * Used by: Hull Performance Agent, Machinery Performance Agent, and other vessel-related agents
 *
 * Features:
 * - Handles multiple vessels in single query
 * - Recognizes common variations (MV OCEAN PRIDE, M/V Ocean Pride, etc.)
 * - Extracts IMO numbers with or without "IMO" prefix
 * - Robust to typos and partial matches
 * - Runs in parallel with other early-stage agents
 */

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { MultiAgentState } from '../state';
import { AgentRegistry } from '../registry';
import { AgentRegistryV2 } from '../agent-registry-v2';
import { withTimeout } from '../optimizations';
import { LLMFactory } from '../llm-factory';

// ============================================================================
// Entity Extraction Schema
// ============================================================================

const EntityExtractionSchema = z.object({
  vessel_names: z
    .array(z.string())
    .describe(
      'Array of vessel names mentioned in the query. Extract name only, without MV/M/V prefixes.'
    ),
  imo_numbers: z
    .array(z.string())
    .describe(
      'Array of IMO numbers mentioned in the query. Return as 7-digit strings without IMO prefix.'
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('Confidence level in the extraction accuracy'),
});

type EntityExtraction = z.infer<typeof EntityExtractionSchema>;

// ============================================================================
// LLM Configuration (via LLMFactory at invoke time: GPT-4o-mini or Claude Haiku)
// ============================================================================

/** Timeout for entity extraction LLM call to avoid hanging on 529/slow API */
const ENTITY_EXTRACTOR_LLM_TIMEOUT_MS = 20_000;

// ============================================================================
// Fallback: regex extraction when LLM fails (timeout / 529)
// ============================================================================

const HULL_VESSEL_NAME_PATTERNS = [
  // "hull performance of X" or "hull condition for X"
  /(?:hull\s+performance|hull\s+condition)\s+(?:of|for)\s+([A-Za-z0-9\s\-]+?)(?:\s+for\s|\s*$)/i,
  // "give me hull performance of X", "show me hull condition for X"
  /(?:give me|show me|get|fetch|check)\s+(?:me\s+)?(?:the\s+)?(?:hull\s+performance|hull\s+condition)\s+(?:of|for)\s+([A-Za-z0-9\s\-]+?)(?:\s+for\s|\s*$)/i,
];

const HULL_IMO_PATTERN = /(?:imo\s+)?(\d{7})\b/i;

/**
 * Extract a single vessel name or IMO from a hull-style query when LLM fails.
 * Returns normalized name (uppercase) or IMO string, or null if no match.
 */
export function extractVesselFromHullQuery(query: string): { name?: string; imo?: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Try 7-digit IMO first
  const imoMatch = trimmed.match(HULL_IMO_PATTERN);
  if (imoMatch?.[1]) return { imo: imoMatch[1] };

  // Try vessel name patterns
  for (const re of HULL_VESSEL_NAME_PATTERNS) {
    const match = trimmed.match(re);
    const name = match?.[1]?.trim();
    if (name && name.length > 0) {
      return { name: name.toUpperCase() };
    }
  }
  return null;
}

// ============================================================================
// System Prompt
// ============================================================================

const ENTITY_EXTRACTION_PROMPT = `You are a maritime entity extractor. Your job is to extract vessel identifiers from user queries.

**Task:**
Extract vessel names and IMO numbers mentioned in the user's query.

**Vessel Names:**
- Usually in ALL CAPS or Title Case
- May include prefixes like "MV", "M/V", "M.V.", "MT", "SS" - REMOVE these prefixes
- Examples: "MV OCEAN PRIDE" → extract "OCEAN PRIDE"
- Examples: "M/V Atlantic Star" → extract "ATLANTIC STAR"
- Handle typos reasonably (e.g., "Ocean Pried" likely means "OCEAN PRIDE")

**IMO Numbers:**
- 7-digit numbers, sometimes prefixed with "IMO"
- Examples: "IMO 9876543" → extract "9876543"
- Examples: "9876543" → extract "9876543"
- Only extract if it's clearly a vessel identifier, not random numbers

**Multiple Vessels:**
- User may mention multiple vessels (e.g., "Compare TITAN and ATHENA")
- Extract all vessels mentioned

**Non-Vessel Queries:**
- If no vessels are mentioned, return empty arrays
- Examples: "What's the weather in Singapore?" → no vessels
- Examples: "Show me bunker prices" → no vessels

**Confidence Levels:**
- High: Clear vessel names/IMOs, no ambiguity
- Medium: Some variations or potential typos, but likely correct
- Low: Ambiguous or unclear identifiers

**Output Format:**
Return ONLY valid JSON matching the schema. No preamble, no explanation.

**Examples:**

Input: "What's the position of OCEAN PRIDE?"
Output: {"vessel_names": ["OCEAN PRIDE"], "imo_numbers": [], "confidence": "high"}

Input: "Show noon report for IMO 9876543"
Output: {"vessel_names": [], "imo_numbers": ["9876543"], "confidence": "high"}

Input: "Compare TITAN and ATHENA fuel consumption"
Output: {"vessel_names": ["TITAN", "ATHENA"], "imo_numbers": [], "confidence": "high"}

Input: "What's the weather in Singapore?"
Output: {"vessel_names": [], "imo_numbers": [], "confidence": "high"}

Input: "Status of MV ATLANTIC STAR (IMO 9123456)"
Output: {"vessel_names": ["ATLANTIC STAR"], "imo_numbers": ["9123456"], "confidence": "high"}

Input: "How is vessel Ocean Pried doing?" (typo)
Output: {"vessel_names": ["OCEAN PRIDE"], "imo_numbers": [], "confidence": "medium"}`;

// ============================================================================
// Agent Node Function
// ============================================================================

/**
 * Options for entity extractor (test-only)
 */
export interface EntityExtractorOptions {
  /** Mock LLM response for testing - when provided, skips actual LLM call */
  __mockLLMResponse?: string;
}

/**
 * Entity Extractor Agent Node
 *
 * Extracts vessel identifiers from user query and adds to state
 *
 * @param state - Current multi-agent state
 * @param options - LangGraph runtime config when invoked by graph; or EntityExtractorOptions for tests (__mockLLMResponse)
 */
export async function entityExtractorAgentNode(
  state: MultiAgentState,
  options?: unknown
): Promise<Partial<MultiAgentState>> {
  const mockResponse =
    options &&
    typeof options === 'object' &&
    '__mockLLMResponse' in options
      ? (options as EntityExtractorOptions).__mockLLMResponse
      : undefined;
  const startTime = Date.now();
  console.log('[ENTITY-EXTRACTOR] 🔍 Starting entity extraction...');

  try {
    // Skip if entities already extracted (idempotent)
    if (state.vessel_identifiers) {
      console.log('[ENTITY-EXTRACTOR] ⏭️  Entities already extracted, skipping');
      return {};
    }

    // Get user query from last human message (after route/bunker agents run, last message is not the user's)
    const messages = state.messages || [];
    const humanMessages = messages.filter((m: any) => m instanceof HumanMessage);
    const lastHuman = humanMessages.length ? humanMessages[humanMessages.length - 1] : null;
    const lastHumanContent = lastHuman?.content;
    const userQuery =
      (typeof lastHumanContent === 'string'
        ? lastHumanContent
        : Array.isArray(lastHumanContent)
          ? (lastHumanContent as { text?: string }[]).map((c) => (c && typeof c === 'object' && 'text' in c ? (c as { text?: string }).text : '')).join('')
          : '') || '';

    if (!userQuery) {
      console.warn('[ENTITY-EXTRACTOR] ⚠️  No user query found in messages');
      return {
        agent_status: {
          ...(state.agent_status || {}),
          entity_extractor: 'success',
        },
      };
    }

    // Regex-first: for hull-style queries, skip LLM and use fast extraction
    const regexFirst = extractVesselFromHullQuery(userQuery);
    if (regexFirst) {
      const duration = Date.now() - startTime;
      console.log(
        `[ENTITY-EXTRACTOR] ✅ Regex-first extracted in ${duration}ms:`,
        regexFirst.name ?? `IMO ${regexFirst.imo}`
      );
      return {
        vessel_identifiers: {
          names: regexFirst.name ? [regexFirst.name] : [],
          imos: regexFirst.imo ? [regexFirst.imo] : [],
        },
        agent_status: {
          ...(state.agent_status || {}),
          entity_extractor: 'success',
        },
      };
    }

    // Extract entities using LLM - invoke and parse JSON response
    // Support mock response for testing (skips actual LLM call)
    // Timeout to avoid hanging on 529 Overloaded or slow Anthropic API
    const rawContent: string | object =
      mockResponse !== undefined
        ? mockResponse
        : await (async () => {
            const llm = LLMFactory.getLLMForTask('entity_extraction');
            const response = await withTimeout(
              llm.invoke([
                new SystemMessage(ENTITY_EXTRACTION_PROMPT),
                new HumanMessage(userQuery),
              ]),
              ENTITY_EXTRACTOR_LLM_TIMEOUT_MS,
              `Entity extraction LLM timeout (${ENTITY_EXTRACTOR_LLM_TIMEOUT_MS / 1000}s)`
            );
            return response.content;
          })();
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? (rawContent as { text?: string }[])
              .map((c) => (typeof c === 'object' && c && 'text' in c ? c.text : String(c)))
              .join('')
          : String(rawContent ?? '');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr || '{}');
    const extraction: EntityExtraction = EntityExtractionSchema.parse(parsed);

    const duration = Date.now() - startTime;

    // Only update state if entities were found
    if (
      extraction.vessel_names.length > 0 ||
      extraction.imo_numbers.length > 0
    ) {
      console.log(
        `[ENTITY-EXTRACTOR] ✅ Extracted entities in ${duration}ms:`,
        `\n  Names: [${extraction.vessel_names.join(', ')}]`,
        `\n  IMOs: [${extraction.imo_numbers.join(', ')}]`,
        `\n  Confidence: ${extraction.confidence}`
      );

      return {
        vessel_identifiers: {
          names: extraction.vessel_names,
          imos: extraction.imo_numbers,
        },
        agent_status: {
          ...(state.agent_status || {}),
          entity_extractor: 'success',
        },
      };
    }

    console.log(
      `[ENTITY-EXTRACTOR] ℹ️  No vessel entities found in query (${duration}ms)`
    );
    return {
      agent_status: {
        ...(state.agent_status || {}),
        entity_extractor: 'success',
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ENTITY-EXTRACTOR] ❌ Error after ${duration}ms:`, error);

    // Fallback: try regex extraction for hull-style queries when LLM failed
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];
    const userQuery =
      (typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : (lastMessage?.content as { text?: string }[])?.map((c) => c.text ?? '').join('')) || '';
    const fallback = userQuery ? extractVesselFromHullQuery(userQuery) : null;
    if (fallback) {
      console.log('[ENTITY-EXTRACTOR] Fallback: extracted vessel from query (LLM failed)');
      return {
        vessel_identifiers: {
          names: fallback.name ? [fallback.name] : [],
          imos: fallback.imo ? [fallback.imo] : [],
        },
        agent_status: {
          ...(state.agent_status || {}),
          entity_extractor: 'success',
        },
      };
    }

    return {
      agent_errors: {
        ...(state.agent_errors || {}),
        entity_extractor: {
          error:
            error instanceof Error ? error.message : 'Entity extraction failed',
          timestamp: Date.now(),
        },
      },
      agent_status: {
        ...(state.agent_status || {}),
        entity_extractor: 'failed',
      },
    };
  }
}

// ============================================================================
// Agent Registration
// ============================================================================

AgentRegistryV2.register({
  agent_id: 'entity_extractor',
  agent_name: 'Entity Extractor Agent',
  domain: 'vessel_performance',
  description:
    'Extracts vessel names and IMO numbers from user queries using LLM-powered entity recognition',
  version: '1.0.0',

  prerequisites: {
    required_state: ['messages'],
    optional_state: [],
    required_agents: [],
  },

  produces: {
    primary: ['vessel_identifiers'],
    side_effects: [],
  },

  available_tools: [],
  required_tools: [],

  avg_execution_time_ms: 2000,
  can_run_in_parallel: true,
  priority: 'high',
});

// Register with main AgentRegistry for supervisor planning
AgentRegistry.registerAgent({
  agent_name: 'entity_extractor',
  description:
    'Extracts and validates vessel identifiers (names, IMO numbers) from user queries. Foundation phase - detailed performance analysis (Hull & Machinery agents) coming in Phase 2.',
  available_tools: [],
  prerequisites: ['messages'],
  outputs: ['vessel_identifiers'],
  is_deterministic: true,
  workflow_steps: [
    'Extract vessel names and IMO numbers from user query',
    'Store vessel_identifiers in state',
    'Confirm vessel found and inform user about Phase 2 features',
  ],
});
