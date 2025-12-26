/**
 * Port Lookup Utility
 * 
 * Fuzzy searches port database to find port codes from user queries
 */

import portsData from '@/lib/data/ports.json';

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
 * Fuzzy search for port by name or code
 * Returns port code if found, null otherwise
 */
export function findPortCode(query: string): string | null {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Direct code match (SGSIN, AEJEA, etc.)
  const directMatch = PORTS.find(
    p => p.port_code.toLowerCase() === normalizedQuery
  );
  if (directMatch) {
    return directMatch.port_code;
  }
  
  // Exact name match
  const exactNameMatch = PORTS.find(
    p => p.name.toLowerCase() === normalizedQuery
  );
  if (exactNameMatch) {
    return exactNameMatch.port_code;
  }
  
  // Partial name match (Singapore → SGSIN)
  const partialMatch = PORTS.find(
    p => p.name.toLowerCase().includes(normalizedQuery) ||
         normalizedQuery.includes(p.name.toLowerCase())
  );
  if (partialMatch) {
    return partialMatch.port_code;
  }
  
  // Common aliases
  const aliases: Record<string, string> = {
    'spore': 'SGSIN',
    'sing': 'SGSIN',
    'fuji': 'AEFJR',
    'fujairah': 'AEFJR',
    'jebel ali': 'AEJEA',
    'dubai': 'AEDXB',
    'rotterdam': 'NLRTM',
    'houston': 'USHOU',
    'la': 'USLAX',
    'los angeles': 'USLAX',
    'shanghai': 'CNSHA',
    'hong kong': 'HKHKG',
    'mumbai': 'INMUN',
    'colombo': 'LKCMB',
  };
  
  const aliasMatch = aliases[normalizedQuery];
  if (aliasMatch) {
    return aliasMatch;
  }
  
  return null;
}

/**
 * Extract origin and destination from query using fuzzy port lookup
 */
export function extractPortsFromQuery(query: string): { origin: string | null; destination: string | null } {
  console.log('🔍 [PORT-LOOKUP] Analyzing query:', query);
  
  // Pattern 1: "X to Y" or "from X to Y"
  const toPattern = /(?:from\s+)?([A-Za-z\s]+)\s+to\s+([A-Za-z\s]+)/i;
  const toMatch = query.match(toPattern);
  
  if (toMatch) {
    const originQuery = toMatch[1].trim();
    const destQuery = toMatch[2].trim();
    
    const origin = findPortCode(originQuery);
    const destination = findPortCode(destQuery);
    
    if (origin && destination) {
      console.log('✅ [PORT-LOOKUP] Found:', origin, '→', destination);
      return { origin, destination };
    }
  }
  
  // Pattern 2: Look for any port mentions
  const words = query.split(/\s+/);
  const foundPorts: string[] = [];
  
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
    console.log('✅ [PORT-LOOKUP] Found destination only:', foundPorts[0]);
    return { origin: null, destination: foundPorts[0] };
  }
  
  console.warn('⚠️ [PORT-LOOKUP] No ports found in query');
  return { origin: null, destination: null };
}

/**
 * Get all available port codes and names (for debugging/reference)
 */
export function getAllPorts(): Port[] {
  return PORTS;
}

