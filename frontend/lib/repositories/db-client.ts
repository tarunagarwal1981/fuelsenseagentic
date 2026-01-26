/**
 * Supabase database client wrapper
 * Provides a typed Supabase client instance
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Creates and returns a singleton Supabase client instance
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from environment variables
 * @returns Typed Supabase client
 */
export function createSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  // Check both NEXT_PUBLIC_ prefixed (Next.js convention) and non-prefixed versions
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase configuration missing: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) must be set'
    );
  }

  try {
    supabaseClient = createClient(url, anonKey);
    return supabaseClient;
  } catch (error) {
    console.error('[SupabaseClient] Failed to initialize Supabase client:', error);
    throw error;
  }
}

/**
 * Get the current Supabase client instance (creates if needed)
 * @returns Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  return createSupabaseClient();
}
