/**
 * Port Lookup Utility
 * 
 * Fuzzy searches port database to find port codes from user queries
 */

import portsData from '@/lib/data/ports.json';
import { PortLogger, startLoggingSession } from './debug-logger';

interface Port {
  port_code: string;
  name: string;
  country: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

const PORTS: Port[] = portsData as Port[];

/**
 * Stop words that should NOT be matched as port names
 * These are common words that appear in queries but are not ports
 */
const STOP_WORDS = new Set([
  // Common English articles and prepositions
  'me', 'and', 'n', 'to', 'from', 'the', 'a', 'an', 'for', 'or',
  'at', 'in', 'on', 'by', 'of', 'with', 'between', 'via', 'through',
  // Common query words
  'bunker', 'fuel', 'options', 'give', 'show', 'get', 'find', 'what',
  'where', 'when', 'how', 'which', 'best', 'cheapest', 'optimal',
  // Vessel-related words
  'mv', 'vessel', 'ship', 'tanker', 'cargo', 'container', 'bulk',
  // Pronouns and other common words
  'our', 'we', 'us', 'you', 'your', 'please', 'help', 'can', 'could',
  'would', 'should', 'will', 'need', 'want', 'like', 'looking',
  // Numbers and units (single characters that could match ports)
  'i', 'is', 'it', 'be', 'do', 'if', 'so', 'no', 'my', 'am',
  // Common maritime terms that aren't ports
  'port', 'route', 'voyage', 'trip', 'transit', 'sailing', 'steam',
]);

/**
 * Check if a query term is a stop word that should not be matched as a port
 */
function isStopWord(term: string): boolean {
  return STOP_WORDS.has(term.toLowerCase().trim());
}

/**
 * Parse GPS coordinates from query string
 * Supports patterns: "10°N 65°E", "10N 65E", "10.5°N, 65.2°E", "25.5N 55.3E"
 * Returns {lat, lon} or null if not found
 */
export function parseCoordinates(query: string): { lat: number; lon: number } | null {
  // Pattern 1: "10°N 65°E" or "10N 65E"
  const pattern1 = /(\d+\.?\d*)\s*°?\s*([NS])\s+(\d+\.?\d*)\s*°?\s*([EW])/i;
  const match1 = query.match(pattern1);
  
  if (match1) {
    const latValue = parseFloat(match1[1]);
    const latDir = match1[2].toUpperCase();
    const lonValue = parseFloat(match1[3]);
    const lonDir = match1[4].toUpperCase();
    
    const lat = latDir === 'N' ? latValue : -latValue;
    const lon = lonDir === 'E' ? lonValue : -lonValue;
    
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const coords = { lat, lon };
      PortLogger.logCoordinateExtraction(coords, 'pattern1');
      return coords;
    }
  }
  
  // Pattern 2: "10.5°N, 65.2°E" (with comma)
  const pattern2 = /(\d+\.?\d*)\s*°?\s*([NS])\s*,\s*(\d+\.?\d*)\s*°?\s*([EW])/i;
  const match2 = query.match(pattern2);
  
  if (match2) {
    const latValue = parseFloat(match2[1]);
    const latDir = match2[2].toUpperCase();
    const lonValue = parseFloat(match2[3]);
    const lonDir = match2[4].toUpperCase();
    
    const lat = latDir === 'N' ? latValue : -latValue;
    const lon = lonDir === 'E' ? lonValue : -lonValue;
    
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const coords = { lat, lon };
      PortLogger.logCoordinateExtraction(coords, 'pattern2');
      return coords;
    }
  }
  
  // Pattern 3: "position 10°N 65°E" or "at 10N 65E"
  const pattern3 = /(?:position|at|location)\s+(\d+\.?\d*)\s*°?\s*([NS])\s+(\d+\.?\d*)\s*°?\s*([EW])/i;
  const match3 = query.match(pattern3);
  
  if (match3) {
    const latValue = parseFloat(match3[1]);
    const latDir = match3[2].toUpperCase();
    const lonValue = parseFloat(match3[3]);
    const lonDir = match3[4].toUpperCase();
    
    const lat = latDir === 'N' ? latValue : -latValue;
    const lon = lonDir === 'E' ? lonValue : -lonValue;
    
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const coords = { lat, lon };
      PortLogger.logCoordinateExtraction(coords, 'pattern3');
      return coords;
    }
  }
  
  PortLogger.logCoordinateExtraction(null, 'none');
  return null;
}

/**
 * Calculate haversine distance between two coordinate points in nautical miles
 * Earth radius = 3440.065 nm
 */
export function haversineDistance(
  coord1: { lat: number; lon: number },
  coord2: { lat: number; lon: number }
): number {
  const R = 3440.065; // Earth radius in nautical miles
  
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const deltaLatRad = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLonRad = ((coord2.lon - coord1.lon) * Math.PI) / 180;
  
  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Find nearest port to given coordinates
 * Returns port with distance in nautical miles
 */
export function findNearestPort(coords: { lat: number; lon: number }): {
  port_code: string;
  name: string;
  distance_nm: number;
  coordinates: { lat: number; lon: number };
} | null {
  if (!PORTS || PORTS.length === 0) {
    console.warn('[PORT-LOOKUP] No ports data available');
    return null;
  }
  
  let nearestPort: Port | null = null;
  let minDistance = Infinity;
  
  for (const port of PORTS) {
    if (!port.coordinates || !port.coordinates.lat || !port.coordinates.lon) {
      continue;
    }
    
    const distance = haversineDistance(coords, port.coordinates);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPort = port;
    }
  }
  
  if (!nearestPort) {
    return null;
  }
  
  // If nearest port is >500nm away, likely in middle of ocean
  if (minDistance > 500) {
    console.warn(`[PORT-LOOKUP] Nearest port is ${minDistance.toFixed(0)}nm away - may be in open ocean`);
  }
  
  PortLogger.logPortResolution(
    nearestPort.port_code,
    nearestPort.coordinates,
    'static'
  );
  
  return {
    port_code: nearestPort.port_code,
    name: nearestPort.name,
    distance_nm: minDistance,
    coordinates: nearestPort.coordinates,
  };
}

/**
 * Fuzzy search for port by name or code
 * Returns port code if found, null otherwise
 * Uses scoring system to pick best match
 */
export function findPortCode(query: string): string | null {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Direct code match (SGSIN, AEJEA, etc.) - highest priority
  const directMatch = PORTS.find(
    p => p.port_code.toLowerCase() === normalizedQuery
  );
  if (directMatch) {
    return directMatch.port_code;
  }
  
  // Check aliases first (before scoring)
  const aliases: Record<string, string> = {
    // Singapore
    'spore': 'SGSIN',
    'sing': 'SGSIN',
    'singapore': 'SGSIN',
    'sgp': 'SGSIN',
    
    // Dubai area
    'jebel ali': 'AEJEA',
    'jebel': 'AEJEA',
    'dubai port': 'AEDXB',
    'dubai': 'AEJEA',  // Default to Jebel Ali (main bunker port)
    
    // Fujairah
    'fuji': 'AEFJR',
    'fujairah': 'AEFJR',
    
    // Rotterdam area
    'europort': 'NLRTM',
    'rotterdam': 'NLRTM',
    'rtm': 'NLRTM',
    'europoort': 'NLRTM',
    
    // Houston
    'houston': 'USHOU',
    'houst': 'USHOU',
    
    // Los Angeles
    'la': 'USLAX',
    'los angeles': 'USLAX',
    'lax': 'USLAX',
    
    // Shanghai
    'shanghai': 'CNSHA',
    'sha': 'CNSHA',
    
    // Hong Kong
    'hong kong': 'HKHKG',
    'hk': 'HKHKG',
    'hkg': 'HKHKG',
    
    // Mumbai
    'mumbai': 'INMUN',
    'bombay': 'INMUN',
    
    // Colombo
    'colombo': 'LKCMB',
    'cmb': 'LKCMB',
    
    // New York
    'new york': 'USNYC',
    'nyc': 'USNYC',
    'ny': 'USNYC',
    
    // London
    'london': 'GBLON',
    'lon': 'GBLON',
    
    // Hamburg
    'hamburg': 'DEHAM',
    'ham': 'DEHAM',
    
    // Antwerp
    'antwerp': 'BEANR',
    'anr': 'BEANR',
    
    // Tokyo
    'tokyo': 'JPTYO',
    'tyo': 'JPTYO',
    
    // Busan
    'busan': 'KRPUS',
    'pusan': 'KRPUS',
    'pus': 'KRPUS',
    
    // Port Klang
    'port klang': 'MYPKG',
    'klang': 'MYPKG',
    'pkg': 'MYPKG',
    
    // Tanjung Pelepas
    'tanjung pelepas': 'MYTPP',
    'pelepas': 'MYTPP',
    'tpp': 'MYTPP',
  };
  
  const aliasMatch = aliases[normalizedQuery];
  if (aliasMatch) {
    return aliasMatch;
  }
  
  // Collect all potential matches
  const candidates: Port[] = [];
  
  // Exact name match
  const exactNameMatch = PORTS.find(
    p => p.name.toLowerCase() === normalizedQuery
  );
  if (exactNameMatch) {
    candidates.push(exactNameMatch);
  }
  
  // Partial name match (Singapore → SGSIN)
  const partialMatches = PORTS.filter(
    p => p.name.toLowerCase().includes(normalizedQuery) ||
         normalizedQuery.includes(p.name.toLowerCase())
  );
  candidates.push(...partialMatches);
  
  // Use scoring to select best match
  const bestMatch = selectBestMatch(query, candidates);
  if (bestMatch) {
    return bestMatch.port_code;
  }
  
  return null;
}

/**
 * Score how well a port matches a query (0-100)
 */
function scorePortMatch(query: string, port: Port): number {
  const normalizedQuery = query.toLowerCase().trim();
  const portCodeLower = port.port_code.toLowerCase();
  const portNameLower = port.name.toLowerCase();
  
  // CRITICAL: Skip scoring for stop words
  // This prevents false matches like "me" → DEBRE, "and" → INIXY, "n" → SGSIN
  if (isStopWord(normalizedQuery)) {
    return 0;
  }
  
  // Skip very short queries (1-2 chars) unless they're exact port codes
  if (normalizedQuery.length <= 2 && portCodeLower !== normalizedQuery) {
    return 0;
  }
  
  // Exact code match: 100 points
  if (portCodeLower === normalizedQuery) {
    return 100;
  }
  
  // Exact name match: 90 points
  if (portNameLower === normalizedQuery) {
    return 90;
  }
  
  // Alias match: 80 points (checked separately in findPortCode)
  
  // Contains match: 50 points (but only for meaningful query lengths)
  if (normalizedQuery.length >= 3 && 
      (portNameLower.includes(normalizedQuery) || normalizedQuery.includes(portNameLower))) {
    return 50;
  }
  
  // Fuzzy match: 30 points (simple word overlap, excluding stop words)
  const queryWords = normalizedQuery.split(/\s+/).filter(w => !isStopWord(w) && w.length > 2);
  const portWords = portNameLower.split(/\s+/);
  const matchingWords = queryWords.filter(qw => portWords.some(pw => pw.includes(qw) || qw.includes(pw)));
  if (matchingWords.length > 0) {
    return 30;
  }
  
  return 0;
}

/**
 * Select best port match from candidates using scoring
 * Returns null if ambiguous (top 2 scores within 10 points)
 */
function selectBestMatch(query: string, candidates: Port[]): Port | null {
  // Skip stop words immediately - no matching needed
  if (isStopWord(query)) {
    return null;
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  if (candidates.length === 1) {
    return candidates[0];
  }
  
  // Score all candidates
  const scored = candidates.map(port => ({
    port,
    score: scorePortMatch(query, port),
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // If top score is 0, no good match
  if (scored[0].score === 0) {
    return null;
  }
  
  // If only one candidate with score > 0, return it
  if (scored[0].score > 0 && (scored.length === 1 || scored[1].score === 0)) {
    return scored[0].port;
  }
  
  // Check if ambiguous (top 2 scores within 10 points)
  if (scored.length >= 2 && scored[0].score - scored[1].score <= 10) {
    console.warn(`[PORT-LOOKUP] Ambiguous match for "${query}": ${scored[0].port.port_code} (${scored[0].score}pts) vs ${scored[1].port.port_code} (${scored[1].score}pts)`);
    return null; // Ambiguous, let caller handle
  }
  
  return scored[0].port;
}

/**
 * Detect if query is complex and needs LLM extraction
 */
function isComplexQuery(query: string): boolean {
  const complexityIndicators = [
    query.toLowerCase().includes('compare'),
    query.toLowerCase().includes('versus'),
    query.toLowerCase().includes(' or '),
    query.toLowerCase().includes('evaluate'),
    query.toLowerCase().includes('options'),
    query.toLowerCase().includes('alternative'),
    (query.match(/\bto\b/gi) || []).length > 1, // Multiple "to" patterns
    (query.match(/\bat\b/gi) || []).length > 2, // Multiple "at" prepositions
    (query.match(/\bin\b/gi) || []).length > 2, // Multiple "in" prepositions
  ];
  
  const score = complexityIndicators.filter(Boolean).length;
  return score >= 2; // 2+ indicators = complex query
}

/**
 * Extract ports using LLM for complex queries
 */
async function extractPortsWithLLM(query: string): Promise<{ origin: string | null; destination: string | null }> {
  console.log('🤖 [PORT-LOOKUP] Using LLM for complex query analysis');
  
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.warn('🤖 [PORT-LOOKUP] OPENAI_API_KEY not set, skipping LLM extraction');
    return { origin: null, destination: null };
  }
  
  try {
    const { ChatOpenAI } = await import('@langchain/openai');
    
    const llm = new ChatOpenAI({ 
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 100,
    });
    
    const prompt = `Extract ONLY the origin and destination ports for the MAIN VOYAGE from this maritime query.

IMPORTANT: Ignore ports mentioned for comparison, evaluation, "versus", or "or" scenarios.
Focus on the actual voyage route (look for "voyage", "sailing", "heading to", "from X to Y").

Query: "${query}"

Return format (one line each):
Origin: [port name or code]
Destination: [port name or code]

If voyage route is unclear, return:
Origin: UNCLEAR
Destination: UNCLEAR`;

    const response = await llm.invoke(prompt);
    const content = typeof response.content === 'string' 
      ? response.content 
      : String(response.content || '');
    
    // Parse response
    const originMatch = content.match(/Origin:\s*([A-Za-z\s]+)/i);
    const destMatch = content.match(/Destination:\s*([A-Za-z\s]+)/i);
    
    if (originMatch && destMatch) {
      const originText = originMatch[1].trim();
      const destText = destMatch[1].trim();
      
      if (originText === 'UNCLEAR' || destText === 'UNCLEAR') {
        console.warn('🤖 [PORT-LOOKUP] LLM could not determine clear route');
        return { origin: null, destination: null };
      }
      
      // Convert to port codes using existing findPortCode
      const origin = findPortCode(originText);
      const destination = findPortCode(destText);
      
      if (origin && destination) {
        console.log(`🤖 [PORT-LOOKUP] LLM extracted: ${origin} → ${destination}`);
        return { origin, destination };
      } else {
        console.warn(`🤖 [PORT-LOOKUP] LLM extracted text but couldn't convert to codes: "${originText}" → "${destText}"`);
      }
    }
    
    throw new Error('Failed to parse LLM response');
  } catch (error) {
    console.error('🤖 [PORT-LOOKUP] LLM extraction failed:', error);
    PortLogger.logError('llm-extraction', error);
    return { origin: null, destination: null };
  }
}

/**
 * Extract origin and destination from query using deterministic methods (sync)
 * Priority: coordinates > string match > defaults
 */
function extractPortsDeterministic(query: string): { origin: string | null; destination: string | null } {
  startLoggingSession();
  PortLogger.logQuery(query);
  
  // STEP 1: Check for coordinates in query (highest priority)
  const coords = parseCoordinates(query);
  let originFromCoords: string | null = null;
  
  if (coords) {
    const nearest = findNearestPort(coords);
    if (nearest) {
      originFromCoords = nearest.port_code;
      console.log(`[PORT-LOOKUP] Using coordinates for origin: ${nearest.port_code} (${nearest.name}) - ${nearest.distance_nm.toFixed(0)}nm away`);
    }
  }
  
  // STEP 2: Pattern matching for "X to Y" or "from X to Y"
  const toPattern = /(?:from\s+)?([A-Za-z0-9°\s,\.]+?)\s+to\s+([A-Za-z\s]+)/i;
  const toMatch = query.match(toPattern);
  
  if (toMatch) {
    const originQuery = toMatch[1].trim();
    const destQuery = toMatch[2].trim();
    
    // If we found coordinates, use that for origin, otherwise try string match
    let origin: string | null = originFromCoords;
    if (!origin) {
      origin = findPortCode(originQuery);
    }
    
    const destination = findPortCode(destQuery);
    
    if (origin && destination) {
      PortLogger.logPortIdentification(origin, destination, originFromCoords ? 'coordinates+string' : 'string');
      return { origin, destination };
    }
    
    // If we have origin from coordinates but no destination match, still return origin
    if (origin && !destination) {
      console.log('✅ [PORT-LOOKUP] Found origin from coordinates:', origin, 'but destination not found');
      return { origin, destination: null };
    }
  }
  
  // STEP 3: Look for any port mentions (if no "to" pattern found)
  const words = query.split(/\s+/);
  const foundPorts: string[] = [];
  
  // If we have origin from coordinates, don't search for it again
  if (originFromCoords) {
    foundPorts.push(originFromCoords);
  }
  
  for (let i = 0; i < words.length; i++) {
    // Try single word
    const singleWord = words[i];
    const code = findPortCode(singleWord);
    if (code && !foundPorts.includes(code)) {
      foundPorts.push(code);
    }
    
    // Try two-word phrases
    if (i < words.length - 1) {
      const twoWords = `${words[i]} ${words[i + 1]}`;
      const code2 = findPortCode(twoWords);
      if (code2 && !foundPorts.includes(code2)) {
        foundPorts.push(code2);
      }
    }
  }
  
  if (foundPorts.length >= 2) {
    console.log('✅ [PORT-LOOKUP] Found multiple ports:', foundPorts);
    return { origin: foundPorts[0], destination: foundPorts[1] };
  }
  
  if (foundPorts.length === 1) {
    if (originFromCoords) {
      console.log('✅ [PORT-LOOKUP] Found origin from coordinates:', foundPorts[0]);
      return { origin: foundPorts[0], destination: null };
    } else {
      console.log('✅ [PORT-LOOKUP] Found destination only:', foundPorts[0]);
      return { origin: null, destination: foundPorts[0] };
    }
  }
  
  // If we have coordinates but no port found nearby, still return the coordinates as origin
  if (coords && originFromCoords) {
    console.log('✅ [PORT-LOOKUP] Using coordinates for origin:', originFromCoords);
    return { origin: originFromCoords, destination: null };
  }
  
  console.warn('⚠️ [PORT-LOOKUP] No ports found in query');
  return { origin: null, destination: null };
}

/**
 * Extract origin and destination from query using fuzzy port lookup with LLM fallback
 * Priority: LLM (if complex) > coordinates > string match > defaults
 */
export async function extractPortsFromQuery(query: string): Promise<{ origin: string | null; destination: string | null }> {
  startLoggingSession();
  PortLogger.logQuery(query);
  
  // STEP 1: Try deterministic extraction first (fast, free)
  const deterministicResult = extractPortsDeterministic(query);
  
  // STEP 2: Check if complex query needs LLM
  if (isComplexQuery(query)) {
    console.log('🔍 [PORT-LOOKUP] Complex query detected, using LLM...');
    const llmResult = await extractPortsWithLLM(query);
    
    if (llmResult.origin && llmResult.destination) {
      PortLogger.logPortIdentification(llmResult.origin, llmResult.destination, 'llm');
      return llmResult;
    }
    
    console.warn('🔍 [PORT-LOOKUP] LLM failed, falling back to deterministic');
  }
  
  // STEP 3: Use deterministic result (even if low confidence)
  if (deterministicResult.origin && deterministicResult.destination) {
    PortLogger.logPortIdentification(deterministicResult.origin, deterministicResult.destination, 'deterministic');
    return deterministicResult;
  }
  
  return { origin: null, destination: null };
}

/**
 * Get all available port codes and names (for debugging/reference)
 */
export function getAllPorts(): Port[] {
  return PORTS;
}

