/**
 * Tier 1: Deterministic query classification via phrase and pattern matching.
 * Fast, no state required. Target: ~90% of queries with high confidence.
 */

import type { QueryClassification, QueryType } from '../query-classifier';

/** Exact phrases per query type (case-insensitive). Confidence 90%. */
const EXACT_PHRASES: Record<QueryType, readonly string[]> = {
  'route-only': [
    'calculate route',
    'give me route',
    'show me route',
    'route from',
    'route between',
    'distance from',
    'how far',
    'route distance',
    'nautical miles from',
  ],
  bunker_planning: [
    'bunker plan',
    'where to bunker',
    'which port to bunker',
    'find bunker port',
    'recommend bunker',
    'bunker recommendation',
    'best port to bunker',
    'bunker at',
  ],
  'weather-analysis': [
    'weather forecast',
    'weather conditions',
    'rough seas',
    'marine weather',
    'weather along route',
    'wave height',
    'weather on route',
  ],
  'cost-comparison': [
    'compare costs',
    'which is cheaper',
    'cost difference',
    'compare bunker',
    'cost comparison',
    'cheapest port',
    'compare prices',
  ],
  informational: [
    'what is',
    'explain',
    'tell me about',
    'how does',
    'information about',
  ],
  validation: [
    'is this feasible',
    'validate',
    'check if',
    'can we',
    'is it possible',
  ],
};

const EXACT_CONFIDENCE = 90;

/** Keywords that imply route-only when present and bunker/fuel/cost are absent. Confidence 85%. */
const ROUTE_ONLY_KEYWORD = 'route';
const ROUTE_EXCLUSION_WORDS = ['bunker', 'fuel', 'cost', 'price', 'cheap', 'compare', 'weather'];

/** Regex patterns: [pattern, queryType, confidence]. */
const REGEX_PATTERNS: ReadonlyArray<{ pattern: RegExp; queryType: QueryType; confidence: number }> = [
  { pattern: /\broute\s+from\s+.+\s+to\s+/i, queryType: 'route-only', confidence: 80 },
  { pattern: /\bdistance\s+between\s+/i, queryType: 'route-only', confidence: 80 },
  { pattern: /\b(how\s+far|nm|nautical)\b.*\b(from|to)\b/i, queryType: 'route-only', confidence: 75 },
  { pattern: /\bwhere\s+(should|can)\s+(i|we)\s+bunker\b/i, queryType: 'bunker_planning', confidence: 85 },
  { pattern: /\bbunker\s+(at|in|port)\b/i, queryType: 'bunker_planning', confidence: 78 },
  { pattern: /\bweather\s+(along|on|for)\s+(the\s+)?route\b/i, queryType: 'weather-analysis', confidence: 80 },
  { pattern: /\bcompare\s+(the\s+)?(costs?|prices?)\b/i, queryType: 'cost-comparison', confidence: 82 },
  { pattern: /\b(cheaper|cheapest)\s+(port|option)\b/i, queryType: 'cost-comparison', confidence: 78 },
];

/**
 * Match message against exact phrases for a query type.
 * @returns Classification with EXACT_CONFIDENCE if any phrase matches, else null.
 */
function matchExactPhrases(message: string): QueryClassification | null {
  const lower = message.toLowerCase().trim();
  for (const [queryType, phrases] of Object.entries(EXACT_PHRASES) as Array<[QueryType, readonly string[]]>) {
    for (const phrase of phrases) {
      if (lower.includes(phrase)) {
        return {
          queryType,
          confidence: EXACT_CONFIDENCE,
          method: 'tier1-exact',
          reasoning: `Exact phrase match: "${phrase}"`,
        };
      }
    }
  }
  return null;
}

/**
 * If message contains route keyword but no bunker/fuel/cost, classify as route-only with 85% confidence.
 */
function matchRouteOnlyKeyword(message: string): QueryClassification | null {
  const lower = message.toLowerCase();
  if (!lower.includes(ROUTE_ONLY_KEYWORD)) return null;
  const hasExclusion = ROUTE_EXCLUSION_WORDS.some((w) => lower.includes(w));
  if (hasExclusion) return null;
  return {
    queryType: 'route-only',
    confidence: 85,
    method: 'tier1-keyword',
    reasoning: `Keyword "route" without bunker/fuel/cost context`,
  };
}

/**
 * Run regex patterns in order; return first match.
 */
function matchRegexPatterns(message: string): QueryClassification | null {
  for (const { pattern, queryType, confidence } of REGEX_PATTERNS) {
    if (pattern.test(message)) {
      return {
        queryType,
        confidence,
        method: 'tier1-regex',
        reasoning: `Regex match: ${pattern.source}`,
      };
    }
  }
  return null;
}

/**
 * Tier 1 deterministic classification: exact phrases → route-only keyword → regex.
 * @param message - User message (raw).
 * @returns QueryClassification if a pattern matches, otherwise confidence 0 and queryType informational.
 */
export function matchDeterministicPatterns(message: string): QueryClassification {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return {
      queryType: 'informational',
      confidence: 0,
      method: 'tier1-deterministic',
      reasoning: 'Empty message',
    };
  }

  const exact = matchExactPhrases(trimmed);
  if (exact) return exact;

  const keyword = matchRouteOnlyKeyword(trimmed);
  if (keyword) return keyword;

  const regex = matchRegexPatterns(trimmed);
  if (regex) return regex;

  return {
    queryType: 'informational',
    confidence: 0,
    method: 'tier1-deterministic',
    reasoning: 'No deterministic pattern matched',
  };
}
