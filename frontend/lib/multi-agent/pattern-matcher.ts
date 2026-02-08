/**
 * Pattern Matcher for Common Query Types
 * 
 * Fast, deterministic routing for obvious query patterns.
 * Avoids LLM calls when query intent is crystal clear.
 * 
 * Part of the 3-Tier Decision Framework:
 * - Tier 1: Pattern Matcher (this file) - Fast regex matching
 * - Tier 2: Decision Framework - Confidence thresholds
 * - Tier 3: LLM Reasoning - Complex queries
 */

import { IntentClassifier } from './intent-classifier';
import { logIntentClassification, hashQueryForIntent } from '@/lib/monitoring/intent-classification-logger';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';

// ============================================================================
// Types
// ============================================================================

export interface PatternMatch {
  /** Whether a pattern was matched */
  matched: boolean;
  /** Type of query detected */
  type:
    | 'port_weather'
    | 'route_calculation'
    | 'bunker_planning'
    | 'compliance'
    | 'vessel_info'
    | 'ambiguous';
  /** Recommended agent to call */
  agent?:
    | 'weather_agent'
    | 'route_agent'
    | 'bunker_agent'
    | 'compliance_agent'
    | 'vessel_info_agent'
    | 'vessel_selection_agent'
    | 'rob_tracking_agent'
    | 'entity_extractor'
    | string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Extracted data from the query */
  extracted_data?: {
    port?: string;
    origin?: string;
    destination?: string;
    date?: string;
  };
  /** Human-readable reason for the match */
  reason?: string;
  /** Latency of classification in ms (set when LLM classifies) */
  latency_ms?: number;
  /** Whether result came from cache (set when LLM classifies) */
  cache_hit?: boolean;
  /** Cost of classification in USD (set when LLM classifies) */
  cost_usd?: number;
  /** Query hash for cache lookup (set when LLM classifies) */
  query_hash?: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Port weather patterns - Match queries about weather at a specific port
 */
const PORT_WEATHER_PATTERNS = [
  // "weather at [PORT]"
  /weather\s+(?:at|in|for)\s+([A-Za-z\s]+?)(?:\s+(?:port|on|tomorrow|today|next)|\s*$|\s+on\s)/i,
  // "weather condition at [PORT]"
  /weather\s+condition(?:s)?\s+(?:at|in|for)\s+([A-Za-z\s]+?)(?:\s+(?:port|on)|\s*$|\s+on\s)/i,
  // "[PORT] weather"
  /^([A-Za-z\s]+?)\s+(?:port\s+)?weather/i,
  // "what's the weather at [PORT]"
  /what(?:'s|s| is)\s+(?:the\s+)?weather\s+(?:like\s+)?(?:at|in|for)\s+([A-Za-z\s]+)/i,
  // "what is the weather condition at [PORT]"
  /what\s+(?:is|are)\s+(?:the\s+)?weather\s+condition(?:s)?\s+(?:at|in|for)\s+([A-Za-z\s]+)/i,
  // "how is the weather at [PORT]"
  /how\s+(?:is|will)\s+(?:the\s+)?weather\s+(?:be\s+)?(?:at|in|for)\s+([A-Za-z\s]+)/i,
];

/**
 * Date extraction patterns
 */
const DATE_PATTERNS = [
  // "on 22nd January 2026" or "on 22nd jan 2026"
  /on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?)/i,
  // "January 22, 2026" or "jan 22 2026"
  /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  // "22/01/2026" or "22-01-2026"
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
  // "2026-01-22" (ISO format)
  /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
  // "tomorrow", "today", "next week"
  /(tomorrow|today|next\s+week|next\s+\d+\s+days?)/i,
];

/**
 * Route calculation patterns - Match queries about routes between ports
 */
const ROUTE_PATTERNS = [
  // "route from [ORIGIN] to [DEST]"
  /route\s+from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\s|$|,|\?)/i,
  // "from [ORIGIN] to [DEST]" (standalone)
  /^from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\s|$|,|\?)/i,
  // "[ORIGIN] to [DEST] route/distance/voyage"
  /([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)\s+(?:route|distance|voyage|trip)/i,
  // "calculate route [ORIGIN] to [DEST]"
  /(?:calculate|compute|find|get)\s+(?:the\s+)?route\s+(?:from\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)/i,
  // "distance from [ORIGIN] to [DEST]"
  /distance\s+(?:from\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)/i,
  // Port codes: "SGSIN to NLRTM"
  /([A-Z]{5})\s+to\s+([A-Z]{5})/i,
];

/**
 * Bunker planning patterns - Match queries about bunkering/fuel
 */
const BUNKER_PATTERNS = [
  // "cheapest/best bunker"
  /(?:cheapest|best|optimal|lowest\s+cost)\s+(?:bunker(?:ing)?|fuel(?:ing)?)/i,
  // "bunker planning/optimization"
  /bunker(?:ing)?\s+(?:planning|optimization|recommendation|analysis|options?)/i,
  // "where to bunker"
  /(?:where|when|which\s+port)\s+(?:to|should\s+(?:I|we))\s+bunker/i,
  // "fuel stop"
  /(?:best|optimal|cheapest)?\s*fuel\s+stop/i,
  // "refuel/bunkering options"
  /(?:refuel(?:ing)?|bunkering)\s+(?:options?|ports?|recommendation)/i,
];

/**
 * Bunker with route patterns - Bunker queries that include route info
 */
const BUNKER_WITH_ROUTE_PATTERNS = [
  // "cheapest bunker from [ORIGIN] to [DEST]"
  /(?:cheapest|best|optimal)\s+bunker(?:ing)?\s+(?:from\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)/i,
  // "bunker for voyage from [ORIGIN] to [DEST]"
  /bunker(?:ing)?\s+(?:for\s+)?(?:voyage\s+)?(?:from\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)/i,
  // "where to bunker [ORIGIN] to [DEST]"
  /where\s+to\s+bunker\s+(?:from\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)/i,
];

/**
 * Compliance patterns - ECA, regulations, etc.
 */
const COMPLIANCE_PATTERNS = [
  /eca\s+(?:zone|crossing|requirement|compliance)/i,
  /emission\s+(?:control|zone|requirement)/i,
  /regulatory\s+(?:compliance|requirement)/i,
  /sulphur\s+(?:cap|limit|requirement)/i,
];

/**
 * Vessel info patterns - Fleet list, vessel count, vessel details
 */
const VESSEL_INFO_PATTERNS = [
  /how\s+many\s+vessels?\s+(?:do\s+we\s+have|are\s+there|in\s+(?:our\s+)?fleet)/i,
  /(?:list|show|get)\s+(?:all\s+)?(?:our\s+)?vessels?/i,
  /(?:number|count)\s+of\s+vessels?/i,
  /vessels?\s+(?:we\s+have|in\s+fleet|in\s+the\s+system)/i,
  /(?:our\s+)?fleet\s+(?:list|count|overview|vessels?)/i,
];

/**
 * Generic/ambiguous words that indicate low confidence
 */
const GENERIC_WORDS = ['port', 'there', 'here', 'location', 'place', 'somewhere', 'anywhere'];

// ============================================================================
// Agent ID to Pattern Type Mapping
// ============================================================================

/**
 * Maps agent_id from IntentClassifier to PatternMatch type.
 * Used when LLM intent classification resolves an ambiguous query.
 */
function intentToPatternType(agent_id: string): PatternMatch['type'] {
  const mapping: Record<string, PatternMatch['type']> = {
    vessel_info_agent: 'vessel_info',
    bunker_agent: 'bunker_planning',
    route_agent: 'route_calculation',
    weather_agent: 'port_weather',
    compliance_agent: 'compliance',
    vessel_selection_agent: 'vessel_info', // vessel-related, closest match
    rob_tracking_agent: 'bunker_planning', // ROB/fuel related
    entity_extractor: 'vessel_info', // fallback for entity extraction
  };
  return mapping[agent_id] ?? 'ambiguous';
}

/**
 * Build extracted_data from IntentClassifier extracted_params
 */
function buildExtractedData(
  params: Record<string, unknown>
): PatternMatch['extracted_data'] {
  if (!params || typeof params !== 'object') return {};
  return {
    port: typeof params.port === 'string' ? params.port : undefined,
    origin: typeof params.origin_port === 'string' ? params.origin_port : undefined,
    destination: typeof params.destination_port === 'string' ? params.destination_port : undefined,
    date: typeof params.date === 'string' ? params.date : undefined,
  };
}

// ============================================================================
// Main Pattern Matching Function
// ============================================================================

/**
 * Match query against known patterns
 * 
 * Returns a PatternMatch with confidence score and extracted data.
 * High confidence (>= 80) means we can proceed without LLM reasoning.
 * Low confidence (< 30) means we should ask for clarification.
 * For ambiguous queries (no pattern match, confidence < 30), falls back to LLM intent classification.
 */
export async function matchQueryPattern(query: string): Promise<PatternMatch> {
  const trimmedQuery = query.trim();
  
  // ============================================================================
  // Pattern 1: Port Weather Queries (highest priority for weather keywords)
  // ============================================================================
  
  // Check if query contains weather-related keywords
  const hasWeatherKeyword = /weather|forecast|condition/i.test(trimmedQuery);
  
  if (hasWeatherKeyword) {
    for (const pattern of PORT_WEATHER_PATTERNS) {
      const match = trimmedQuery.match(pattern);
      if (match) {
        const port = cleanPortName(match[1]);
        
        if (!port) continue;
        
        // Extract date if present
        const date = extractDate(trimmedQuery);
        
        // Calculate confidence
        const confidence = calculatePortWeatherConfidence(port);
        
        return {
          matched: true,
          type: 'port_weather',
          agent: 'weather_agent',
          confidence,
          extracted_data: { port, date },
          reason: `Matched port weather pattern: port="${port}", date="${date || 'current'}", confidence=${confidence}%`,
        };
      }
    }
    
    // Weather keyword but no port matched - check for any capitalized words that could be ports
    const potentialPort = extractPotentialPort(trimmedQuery);
    if (potentialPort && !GENERIC_WORDS.includes(potentialPort.toLowerCase())) {
      const date = extractDate(trimmedQuery);
      return {
        matched: true,
        type: 'port_weather',
        agent: 'weather_agent',
        confidence: 85,
        extracted_data: { port: potentialPort, date },
        reason: `Weather query with potential port: "${potentialPort}", date="${date || 'current'}"`,
      };
    }
  }
  
  // ============================================================================
  // Pattern 2: Bunker with Route (before general bunker, to extract route info)
  // ============================================================================
  
  for (const pattern of BUNKER_WITH_ROUTE_PATTERNS) {
    const match = trimmedQuery.match(pattern);
    if (match) {
      const origin = cleanPortName(match[1]);
      const destination = cleanPortName(match[2]);
      
      if (!origin || !destination) continue;
      
      const confidence = calculateRouteConfidence(origin, destination);
      
      return {
        matched: true,
        type: 'bunker_planning',
        agent: 'route_agent', // Start with route, bunker will follow
        confidence,
        extracted_data: { origin, destination },
        reason: `Bunker query with route: ${origin} → ${destination}, need route first`,
      };
    }
  }
  
  // ============================================================================
  // Pattern 3: Route Calculation Queries
  // ============================================================================
  
  for (const pattern of ROUTE_PATTERNS) {
    const match = trimmedQuery.match(pattern);
    if (match) {
      const origin = cleanPortName(match[1]);
      const destination = cleanPortName(match[2]);
      
      if (!origin || !destination) continue;
      
      const confidence = calculateRouteConfidence(origin, destination);
      
      return {
        matched: true,
        type: 'route_calculation',
        agent: 'route_agent',
        confidence,
        extracted_data: { origin, destination },
        reason: `Matched route pattern: ${origin} → ${destination}, confidence=${confidence}%`,
      };
    }
  }
  
  // ============================================================================
  // Pattern 4: General Bunker Planning (no route info)
  // ============================================================================
  
  for (const pattern of BUNKER_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      // Check if there's any route-like info in the query
      const hasRouteInfo = /from\s+\w+\s+to\s+\w+/i.test(trimmedQuery);
      
      return {
        matched: true,
        type: 'bunker_planning',
        agent: hasRouteInfo ? 'route_agent' : undefined,
        confidence: hasRouteInfo ? 75 : 40, // Lower confidence without route
        extracted_data: {},
        reason: hasRouteInfo 
          ? 'Bunker query with route info - will need route first'
          : 'Bunker query without route info - need clarification or existing route data',
      };
    }
  }
  
  // ============================================================================
  // Pattern 5: Compliance Queries
  // ============================================================================
  
  for (const pattern of COMPLIANCE_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      return {
        matched: true,
        type: 'compliance',
        agent: 'compliance_agent',
        confidence: 85,
        extracted_data: {},
        reason: 'Matched compliance/ECA pattern',
      };
    }
  }

  // ============================================================================
  // Pattern 6: Vessel Info Queries (fleet list, vessel count)
  // ============================================================================
  
  for (const pattern of VESSEL_INFO_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      return {
        matched: true,
        type: 'vessel_info',
        agent: 'vessel_info_agent',
        confidence: 90,
        extracted_data: {},
        reason: 'Matched vessel info/fleet list pattern',
      };
    }
  }
  
  // ============================================================================
  // No Pattern Match - Ambiguous (try LLM intent classification)
  // ============================================================================

  const ambiguousResult: PatternMatch = {
    matched: false,
    type: 'ambiguous',
    confidence: 0,
    reason: 'No clear pattern matched - needs LLM reasoning',
  };

  // If pattern matching failed (ambiguous), try LLM classification
  if (ambiguousResult.type === 'ambiguous') {
    try {
      console.log('🤖 [PATTERN-MATCHER] Ambiguous query, trying LLM intent classification...');
      const llmStart = Date.now();
      const correlationId = getCorrelationId() || 'unknown';
      const classification = await IntentClassifier.classify(query, correlationId);
      const latencyMs = Date.now() - llmStart;

      if (classification && classification.confidence >= 0.7) {
        const patternType = intentToPatternType(classification.agent_id);
        const confidencePercent = Math.round(classification.confidence * 100);

        console.log(`✅ [PATTERN-MATCHER] LLM classified as: ${classification.agent_id} (${confidencePercent}% confidence)`);

        // Only use classification if we can map to a known pattern type
        if (patternType !== 'ambiguous') {
          logIntentClassification({
            correlation_id: correlationId,
            query,
            query_hash: hashQueryForIntent(query),
            classification_method: 'llm_gpt4o_mini',
            matched_agent: classification.agent_id,
            matched_intent: patternType,
            confidence: confidencePercent,
            reasoning: `LLM intent classification: ${classification.reasoning}`,
            cache_hit: false,
            latency_ms: latencyMs,
            cost_usd: 0,
            timestamp: Date.now(),
          });
          return {
            matched: true,
            type: patternType,
            agent: classification.agent_id as PatternMatch['agent'],
            confidence: confidencePercent,
            extracted_data: buildExtractedData(classification.extracted_params ?? {}),
            reason: `LLM intent classification: ${classification.reasoning}`,
            latency_ms: classification.latency_ms,
            cache_hit: classification.cache_hit,
            cost_usd: classification.cost_usd,
            query_hash: classification.query_hash,
          };
        }
      }
    } catch (error) {
      console.warn('⚠️ [PATTERN-MATCHER] LLM classification failed, using pattern match fallback:', error);
      // Fall through to return original ambiguous result
    }
  }

  return ambiguousResult;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean and normalize port name
 */
function cleanPortName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  
  // Trim and normalize whitespace
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  
  // Remove trailing punctuation
  const withoutPunctuation = cleaned.replace(/[.,;:!?]+$/, '');
  
  // Check for generic words
  if (GENERIC_WORDS.includes(withoutPunctuation.toLowerCase())) {
    return undefined;
  }
  
  // Must be at least 2 characters
  if (withoutPunctuation.length < 2) {
    return undefined;
  }
  
  return withoutPunctuation;
}

/**
 * Extract date from query
 */
function extractDate(query: string): string | undefined {
  for (const pattern of DATE_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Extract potential port name from query (fallback when patterns don't match)
 */
function extractPotentialPort(query: string): string | undefined {
  // Remove common words and look for capitalized words
  const words = query.split(/\s+/);
  const skipWords = new Set([
    'weather', 'what', 'is', 'the', 'at', 'in', 'for', 'on', 'condition', 'conditions',
    'how', 'will', 'be', 'like', 'forecast', 'port', 'tomorrow', 'today', 'next',
    'a', 'an', 'of', 'to', 'from',
  ]);
  
  for (const word of words) {
    const cleaned = word.replace(/[^A-Za-z]/g, '');
    if (cleaned.length >= 3 && !skipWords.has(cleaned.toLowerCase())) {
      // Check if it looks like a proper noun (capitalized)
      if (/^[A-Z]/.test(cleaned)) {
        return cleaned;
      }
    }
  }
  
  // Fallback: find any sequence of 3+ letters that's not a stop word
  for (const word of words) {
    const cleaned = word.replace(/[^A-Za-z]/g, '');
    if (cleaned.length >= 4 && !skipWords.has(cleaned.toLowerCase())) {
      return cleaned;
    }
  }
  
  return undefined;
}

/**
 * Calculate confidence for port weather query
 */
function calculatePortWeatherConfidence(port: string): number {
  // Check for generic words
  if (GENERIC_WORDS.includes(port.toLowerCase())) {
    return 20;
  }
  
  // Known port codes (5 letters, all caps)
  if (/^[A-Z]{5}$/.test(port)) {
    return 98;
  }
  
  // Reasonable port name (3+ characters, not a common word)
  if (port.length >= 3) {
    return 95;
  }
  
  // Short but valid
  if (port.length >= 2) {
    return 85;
  }
  
  return 50;
}

/**
 * Calculate confidence for route query
 */
function calculateRouteConfidence(origin: string, destination: string): number {
  let confidence = 90;
  
  // Check for generic words
  if (GENERIC_WORDS.includes(origin.toLowerCase())) {
    confidence -= 60;
  }
  if (GENERIC_WORDS.includes(destination.toLowerCase())) {
    confidence -= 60;
  }
  
  // Bonus for port codes
  if (/^[A-Z]{5}$/.test(origin)) {
    confidence = Math.min(100, confidence + 5);
  }
  if (/^[A-Z]{5}$/.test(destination)) {
    confidence = Math.min(100, confidence + 5);
  }
  
  return Math.max(0, confidence);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate if extracted data is sufficient
 */
export function validateExtractedData(match: PatternMatch): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  
  if (match.type === 'port_weather') {
    if (!match.extracted_data?.port) {
      missing.push('port');
    }
    // Date is optional (defaults to current)
  }
  
  if (match.type === 'route_calculation') {
    if (!match.extracted_data?.origin) {
      missing.push('origin port');
    }
    if (!match.extracted_data?.destination) {
      missing.push('destination port');
    }
  }
  
  if (match.type === 'bunker_planning' && !match.agent) {
    // Bunker without route info needs route
    missing.push('route information (origin and destination)');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Format clarification question based on missing data
 */
export function formatClarificationQuestion(match: PatternMatch, missing: string[]): string {
  if (match.type === 'port_weather' && missing.includes('port')) {
    return "I'd be happy to help with weather information! Which port are you interested in?";
  }
  
  if (match.type === 'route_calculation') {
    if (missing.includes('origin port') && missing.includes('destination port')) {
      return 'I can help calculate a route. Could you provide the origin and destination ports?';
    }
    if (missing.includes('origin port')) {
      return `I can calculate the route to ${match.extracted_data?.destination}. Where is the origin port?`;
    }
    if (missing.includes('destination port')) {
      return `I can calculate the route from ${match.extracted_data?.origin}. What's the destination port?`;
    }
  }
  
  if (match.type === 'bunker_planning') {
    return 'I can help with bunker planning! Could you provide the voyage details (origin and destination ports)?';
  }
  
  return 'Could you provide more details about your request?';
}
