/**
 * EntityExtractionAgent - FuelSense 360
 *
 * Specialized agent that extracts entities from user queries using Claude Sonnet.
 * Called by Supervisor as the first step in every query.
 *
 * Extracts: vessels, ports, dates, fuel types, intent.
 * Uses structured output with JSON schema enforcement.
 * Fallback to regex for common formats when LLM fails.
 */

import { createHash } from 'crypto';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logAgentExecution, logError } from '@/lib/monitoring/axiom-logger';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { retryWithBackoff } from '@/lib/resilience/retry';
import type { RedisCache } from '@/lib/repositories/cache-client';

// ============================================================================
// Types
// ============================================================================

export type EntityExtractionIntent =
  | 'bunker_planning'
  | 'voyage_optimization'
  | 'emissions_calc'
  | 'performance_analysis'
  | 'compliance_check';

export interface ExtractedVessel {
  name?: string;
  imo?: string;
  confidence: number;
}

export interface ExtractedPort {
  name: string;
  type: 'departure' | 'arrival' | 'bunker';
  confidence: number;
}

export interface EntityExtractionResult {
  intent: EntityExtractionIntent;
  vessels: ExtractedVessel[];
  ports: ExtractedPort[];
  dates?: { start?: string; end?: string };
  fuelTypes?: string[];
  rawQuery: string;
  extractionTimestamp: number;
}

// ============================================================================
// Constants
// ============================================================================

const ENTITY_CACHE_TTL = 300; // 5 minutes
const ENTITY_CACHE_PREFIX = 'entity:';
const LLM_TIMEOUT_MS = 2000;
const MAX_RETRIES = 3;
const FUEL_TYPES = ['VLSFO', 'LSMGO', 'HSFO', 'MGO', 'LSFO', 'LSGO'];
const IMO_REGEX = /\bIMO\s*:?\s*(\d{7})\b|\b(\d{7})\s*\(?IMO\)?/gi;

// ============================================================================
// Regex Fallback Patterns
// ============================================================================

function extractIMORegex(query: string): string[] {
  const imos: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMO_REGEX.source, 'gi');
  while ((m = re.exec(query)) !== null) {
    const imo = (m[1] || m[2] || '').trim();
    if (imo && !imos.includes(imo)) imos.push(imo);
  }
  return imos;
}

function extractVesselNameRegex(query: string): string[] {
  const vessels: string[] = [];
  // MT/MV vessel prefix
  const mtMatch = query.match(/\b(?:MT|MV|M\/T|M\/V)\s+([A-Za-z0-9\s]+?)(?:\s+from|\s+to|\s+at|$)/gi);
  if (mtMatch) {
    for (const m of mtMatch) {
      const name = m.replace(/\b(?:MT|MV|M\/T|M\/V)\s+/i, '').trim();
      if (name && name.length > 2 && !vessels.includes(name)) vessels.push(name);
    }
  }
  return vessels;
}

function extractFuelTypesRegex(query: string): string[] {
  const found: string[] = [];
  const upper = query.toUpperCase();
  for (const ft of FUEL_TYPES) {
    if (upper.includes(ft) && !found.includes(ft)) found.push(ft);
  }
  return found;
}

function extractDatePhrasesRegex(query: string): { start?: string; end?: string } {
  const dates: { start?: string; end?: string } = {};
  const today = new Date();

  if (/\b(?:tomorrow|tmrw)\b/i.test(query)) {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    dates.start = t.toISOString().split('T')[0];
  }
  if (/\bnext\s+week\b/i.test(query)) {
    const t = new Date(today);
    t.setDate(t.getDate() + 7);
    dates.end = t.toISOString().split('T')[0];
  }
  if (/\bnext\s+month\b/i.test(query)) {
    const t = new Date(today);
    t.setMonth(t.getMonth() + 1);
    dates.end = t.toISOString().split('T')[0];
  }
  const q1Match = query.match(/\bQ1\s+(\d{4})\b/i);
  if (q1Match) {
    const y = parseInt(q1Match[1], 10);
    dates.start = `${y}-01-01`;
    dates.end = `${y}-03-31`;
  }
  const marchMatch = query.match(/\b(?:march|mar)\s+(\d{1,2})\b/i);
  if (marchMatch) {
    const d = parseInt(marchMatch[1], 10);
    const y = today.getFullYear();
    dates.start = `${y}-03-${String(d).padStart(2, '0')}`;
  }

  return dates;
}

function inferIntentFromKeywords(query: string): EntityExtractionIntent {
  const q = query.toLowerCase();
  if (/\b(?:bunker|fuel)\s+(?:cost|price|planning)\b/i.test(q) || /\bcost\s+for\s+.*\s+from\s+/i.test(q))
    return 'bunker_planning';
  if (/\b(?:compare|emissions)\b/i.test(q) || /\bCII\b/i.test(q)) return 'emissions_calc';
  if (/\b(?:optimize|optimization|voyage)\b/i.test(q)) return 'voyage_optimization';
  if (/\b(?:performance|speed|consumption)\b/i.test(q)) return 'performance_analysis';
  if (/\b(?:compliance|ECA|regulation)\b/i.test(q)) return 'compliance_check';
  return 'bunker_planning'; // default
}

// ============================================================================
// Regex Fallback - Build Partial Result
// ============================================================================

function buildRegexFallbackResult(rawQuery: string): EntityExtractionResult {
  const imos = extractIMORegex(rawQuery);
  const vesselNames = extractVesselNameRegex(rawQuery);
  const fuelTypes = extractFuelTypesRegex(rawQuery);
  const dates = extractDatePhrasesRegex(rawQuery);
  const intent = inferIntentFromKeywords(rawQuery);

  const vessels: ExtractedVessel[] = [];
  for (const imo of imos) {
    vessels.push({ imo, confidence: 0.95 });
  }
  for (const name of vesselNames) {
    if (!vessels.some((v) => v.name === name || v.imo)) {
      vessels.push({ name, confidence: 0.7 });
    }
  }
  if (vessels.length === 0) {
    vessels.push({ confidence: 0 });
  }

  return {
    intent,
    vessels,
    ports: [], // Regex cannot reliably extract port types
    dates: Object.keys(dates).length > 0 ? dates : undefined,
    fuelTypes: fuelTypes.length > 0 ? fuelTypes : undefined,
    rawQuery,
    extractionTimestamp: Date.now(),
  };
}

// ============================================================================
// Cache Key
// ============================================================================

function getQueryHash(query: string): string {
  const normalized = query.toLowerCase().trim().substring(0, 500);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

// ============================================================================
// LLM Extraction with Structured Output
// ============================================================================

const extractionSchema = z.object({
  intent: z.enum([
    'bunker_planning',
    'voyage_optimization',
    'emissions_calc',
    'performance_analysis',
    'compliance_check',
  ]),
  vessels: z.array(
    z.object({
      name: z.string().optional(),
      imo: z.string().optional(),
      confidence: z.number().min(0).max(1),
    })
  ),
  ports: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['departure', 'arrival', 'bunker']),
      confidence: z.number().min(0).max(1),
    })
  ),
  dates: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  fuelTypes: z.array(z.string()).optional(),
});

type ExtractionSchema = z.infer<typeof extractionSchema>;

const EXTRACTION_SYSTEM_PROMPT = `You are an entity extraction specialist for FuelSense 360, a maritime bunker planning system.

Extract entities from the user's natural language query. Be precise and context-aware.

ENTITY TYPES:
1. VESSELS: Names (e.g., "MT PIONEER", "Ocean Star", "OCEAN BREEZE") or IMO numbers (7 digits, e.g., IMO 9234567).
   Handle variations: "MT OCEAN STAR", "Ocean Star", "IMO 1234567" - normalize to consistent form.
2. PORTS: Departure (origin), arrival (destination), bunker (where to bunker).
   Examples: Singapore, Rotterdam, Jebel Ali, AE FJR, SG SIN.
   UN/LOCODE format: "AE FJR", "SG SIN" - preserve as-is.
3. DATES: Parse natural language: "next week", "Q1 2024", "March 15", "tomorrow", "next month".
   Return ISO dates (YYYY-MM-DD) when possible.
4. FUEL TYPES: VLSFO, LSMGO, HSFO, MGO, LSFO, LSGO.
5. INTENT: Classify based on keywords and structure:
   - bunker_planning: bunker cost, fuel planning, bunker ports
   - voyage_optimization: optimize route, voyage planning
   - emissions_calc: emissions, CII, compare emissions
   - performance_analysis: performance, speed, consumption
   - compliance_check: ECA, compliance, regulations

RULES:
- Support multi-vessel and multi-port queries.
- Assign confidence 0-1 for each extracted entity (1 = certain, 0.5 = inferred).
- If ambiguous, use lower confidence and still include the entity.
- Return empty arrays when nothing found.
- For "all vessels" or "all vessels bunkering at X", use intent and ports; vessels can be empty.`;

async function extractWithLLM(rawQuery: string): Promise<EntityExtractionResult> {
  const model = new ChatAnthropic({
    model: 'claude-sonnet-4-20250514',
    temperature: 0,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const extractionTool = tool(
    async (input: ExtractionSchema) => input,
    {
      name: 'extract_entities',
      description: 'Extract maritime entities from the user query',
      schema: extractionSchema,
    }
  );

  const llmWithTool = model.bindTools([extractionTool]);

  const response = await llmWithTool.invoke([
    new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
    new HumanMessage(`Extract entities from this query:\n\n"${rawQuery}"`),
  ]);

  const toolCalls = (response as any).tool_calls || [];
  if (toolCalls.length > 0) {
    const args = toolCalls[0].args as ExtractionSchema;
    const parsed = extractionSchema.safeParse(args);
    if (parsed.success) {
      return {
        intent: parsed.data.intent as EntityExtractionIntent,
        vessels: parsed.data.vessels,
        ports: parsed.data.ports,
        dates: parsed.data.dates,
        fuelTypes: parsed.data.fuelTypes,
        rawQuery,
        extractionTimestamp: Date.now(),
      };
    }
  }

  // Fallback: try to parse from text content
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = extractionSchema.safeParse(JSON.parse(jsonMatch[0]));
      if (parsed.success) {
        return {
          intent: parsed.data.intent as EntityExtractionIntent,
          vessels: parsed.data.vessels,
          ports: parsed.data.ports,
          dates: parsed.data.dates,
          fuelTypes: parsed.data.fuelTypes,
          rawQuery,
          extractionTimestamp: Date.now(),
        };
      }
    } catch {
      // ignore
    }
  }

  throw new Error('LLM did not return valid structured extraction');
}

// ============================================================================
// Main Extraction with Circuit Breaker, Cache, Fallback
// ============================================================================

export interface EntityExtractionOptions {
  cache?: RedisCache;
  correlationId?: string;
  skipCache?: boolean;
}

/**
 * Extract entities from a user query.
 * Uses LLM with structured output, falls back to regex on failure.
 * Results cached in Redis when cache is provided.
 */
export async function extractEntities(
  rawQuery: string,
  options: EntityExtractionOptions = {}
): Promise<EntityExtractionResult> {
  const { cache, correlationId, skipCache = false } = options;
  const cid = correlationId || getCorrelationId() || 'unknown';
  const start = Date.now();

  const cacheKey = `${ENTITY_CACHE_PREFIX}${getQueryHash(rawQuery)}`;

  if (cache && !skipCache) {
    try {
      const cached = await cache.get<EntityExtractionResult>(cacheKey);
      if (cached) {
        logAgentExecution('entity_extraction', cid, Date.now() - start, 'cache_hit', {
          cache_key: cacheKey,
        });
        return { ...cached, rawQuery, extractionTimestamp: Date.now() };
      }
    } catch (e) {
      console.warn('[EntityExtraction] Cache get failed:', e);
    }
  }

  let result: EntityExtractionResult;

  try {
    const llmResult = await retryWithBackoff(
      () =>
        Promise.race([
          extractWithLLM(rawQuery),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Entity extraction timeout')), LLM_TIMEOUT_MS)
          ),
        ]),
      {
        maxAttempts: MAX_RETRIES,
        initialDelay: 500,
        maxDelay: 2000,
        toolName: 'entity_extraction',
        retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'RATE_LIMIT', 'timeout', 'API_ERROR'],
      }
    );

    result = llmResult;

    // Merge regex fallback for IMO/fuel types if LLM missed them
    const regexFallback = buildRegexFallbackResult(rawQuery);
    if (regexFallback.vessels.length > 0 && result.vessels.length === 0) {
      result.vessels = regexFallback.vessels;
    }
    if (regexFallback.fuelTypes && regexFallback.fuelTypes.length > 0) {
      const existing = new Set(result.fuelTypes || []);
      for (const ft of regexFallback.fuelTypes) {
        if (!existing.has(ft)) {
          result.fuelTypes = [...(result.fuelTypes || []), ft];
        }
      }
    }
  } catch (error) {
    logError(cid, error, {
      agent: 'entity_extraction',
      raw_query: rawQuery.substring(0, 200),
      fallback: 'regex',
    });
    result = buildRegexFallbackResult(rawQuery);
  }

  const duration = Date.now() - start;
  logAgentExecution('entity_extraction', cid, duration, 'success', {
    intent: result.intent,
    vessel_count: result.vessels.length,
    port_count: result.ports.length,
  });

  if (cache) {
    try {
      await cache.set(cacheKey, result, ENTITY_CACHE_TTL);
    } catch (e) {
      console.warn('[EntityExtraction] Cache set failed:', e);
    }
  }

  return result;
}
