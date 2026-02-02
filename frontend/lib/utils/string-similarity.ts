/**
 * String Similarity Utilities
 * 
 * Provides fuzzy string matching for port name resolution.
 * Handles spelling variations, common prefixes/suffixes, and transliterations.
 */

/**
 * Calculate Levenshtein distance between two strings
 * 
 * Measures the minimum number of single-character edits (insertions, deletions, substitutions)
 * required to change one string into another.
 * 
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns The Levenshtein distance (0 = identical)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first column (deletions from str1)
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  
  // Initialize first row (insertions to str1)
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  
  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        // Characters match - no operation needed
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // Characters don't match - take minimum of three operations
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity score between two strings
 * 
 * Returns a percentage score (0-100) where 100 is identical and 0 is completely different.
 * Uses normalized Levenshtein distance.
 * 
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity score (0-100, higher is more similar)
 */
export function stringSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  
  // Handle empty strings
  if (maxLen === 0) return 100;
  
  // Calculate distance with lowercase comparison
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  
  // Convert to similarity percentage
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity);
}

/**
 * Remove common prefixes and suffixes from port names
 * 
 * Handles:
 * - Prefixes: "Al", "El", "La", "The", "Port of", "Port"
 * - Suffixes: "Harbor", "Harbour", "Port", directional words
 * 
 * @param name - Port name to normalize
 * @returns Normalized name with affixes removed
 */
export function removeCommonAffixes(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove common prefixes (order matters - longer first)
  const prefixes = [
    'port of ',
    'al ',
    'el ',
    'la ',
    'the ',
    'port ',
  ];
  
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break; // Only remove one prefix
    }
  }
  
  // Remove common suffixes (order matters - longer first)
  const suffixes = [
    ' harbor',
    ' harbour',
    ' port',
    ' north',
    ' south',
    ' east',
    ' west',
  ];
  
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break; // Only remove one suffix
    }
  }
  
  return normalized.trim();
}

/**
 * Check if two strings are similar enough to be considered a match
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @param threshold - Minimum similarity score (0-100) to consider a match
 * @returns True if similarity score >= threshold
 */
export function isSimilar(str1: string, str2: string, threshold: number = 80): boolean {
  return stringSimilarity(str1, str2) >= threshold;
}

/**
 * Find the best match from a list of candidates
 * 
 * @param query - String to match against
 * @param candidates - List of candidate strings
 * @param threshold - Minimum similarity score to consider (default: 60)
 * @returns Object with best match and its score, or null if no match above threshold
 */
export function findBestMatch(
  query: string,
  candidates: string[],
  threshold: number = 60
): { match: string; score: number } | null {
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const score = stringSimilarity(query, candidate);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  
  if (bestMatch === null) return null;
  
  return { match: bestMatch, score: bestScore };
}
