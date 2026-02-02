import { RequestQueryBuilder } from '@nestjsx/crud-request';

/**
 * Raw port data structure from WorldPortIndex API
 * Field names match the actual API response format (camelCase)
 */
interface WorldPortIndexPort {
  id?: number;
  OID?: number;
  worldPortIndexNumber?: number;
  unLocode?: string;
  mainPortName?: string;
  alternatePortName?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  harborSize?: string;
  facilitiesOilTerminal?: string;
  facilitiesLngTerminal?: string;
  facilitiesLiquidBulk?: string;
  oilTerminalDepthM?: number;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Simple query options for port lookup
 */
interface QueryOptions {
  fields?: string[];
  filter?: Record<string, any>;
  search?: Record<string, any>;
  limit?: number;
  offset?: number;
  sort?: string;
}

/**
 * Options for querying ports from WorldPortIndex API
 */
interface PortQueryOptions {
  filters?: Array<{
    field: string;
    operator: '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$cont' | '$in' | '$notin';
    value: string | number | boolean | Array<string | number>;
  }>;
  sort?: Array<{
    field: string;
    order: 'ASC' | 'DESC';
  }>;
  limit?: number;
  offset?: number;
  fields?: string[];
}

/**
 * Port data structure returned from WorldPortIndex API
 */
interface Port {
  id: string;
  portCode: string;
  portName: string;
  country: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Standardized API error response
 */
interface APIError {
  message: string;
  statusCode?: number;
  originalError?: unknown;
  timestamp: string;
}

/**
 * Response wrapper for port queries
 */
interface PortQueryResponse {
  data: Port[];
  total: number;
  page?: number;
  pageSize?: number;
}

/**
 * Client for interacting with WorldPortIndex REST API
 * Fetches port data including codes and coordinates.
 */
export class WorldPortIndexClient {
  private readonly baseURL: string;
  private readonly timeout: number;

  /**
   * Initialize WorldPortIndex client
   * Reads base URL from environment variable or uses default UAT endpoint
   */
  constructor() {
    this.baseURL = 
      process.env.NEXT_PUBLIC_WORLD_PORT_API_URL || 
      'https://uat.fuelsense-api.dexpertsystems.com';
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Build query string from options using NestJS CRUD format
   * @param options - Query options for filtering, sorting, pagination
   * @returns Query string to append to URL
   */
  private buildQueryString(options: PortQueryOptions): string {
    // TODO: Implement query building logic
    throw new Error('Not implemented');
  }

  /**
   * Handle and format API errors consistently
   * Parses NestJS API error format from response body
   * @param error - Error from fetch or other operations
   * @returns Never - always throws formatted error
   */
  private handleAPIError(error: any): never {
    // 1. Check for timeout errors (AbortError)
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('WorldPortIndex API timeout (10s exceeded)');
      }
    }

    // 2. Check if error message contains parsed API error format
    // API returns: {"statusCode": 404, "message": "...", "error": "Not Found"}
    if (error?.message) {
      const msg = error.message;
      
      // Check for "Port API error: 404" format (from our response.ok check)
      if (msg.startsWith('Port API error:')) {
        throw new Error(`WorldPortIndex API error: ${msg.replace('Port API error: ', '')}`);
      }
      
      // Check for "Invalid API response" (JSON parse error)
      if (msg.includes('Invalid API response')) {
        throw new Error('WorldPortIndex API returned invalid JSON response');
      }
    }

    // 3. Check for network/fetch errors
    if (error instanceof TypeError && 
        (error.message?.includes('fetch') || 
         error.message?.includes('network') || 
         error.message?.includes('Failed to fetch'))) {
      throw new Error('Network error connecting to WorldPortIndex API');
    }

    // 4. Check for Response object with API error format
    if (error?.response) {
      const status = error.response.status || 'unknown';
      const statusText = error.response.statusText || 'Unknown error';
      throw new Error(`WorldPortIndex API error: ${status} - ${statusText}`);
    }

    // 5. Otherwise throw original error message or generic error
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Unknown WorldPortIndex API error: ' + String(error));
  }

  /**
   * Query ports from the WorldPortIndex API (generic method - not currently used)
   * Note: We use specialized methods (findByLOCODE, searchByName) instead
   * This method is kept for potential future use but marked as private
   * @deprecated Use findByLOCODE or searchByName instead
   */
  private async getPortsGeneric(queryString: string): Promise<WorldPortIndexPort[]> {
    try {
      // Construct full URL
      const url = `${this.baseURL}/world-port-index${queryString ? '?' + queryString : ''}`;

      // Make fetch call with timeout
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      // Check if response is ok
      if (!response.ok) {
        // Try to parse error response body
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(`Port API error: ${response.status} - ${errorMessage}`);
      }

      // Parse JSON response
      let data: WorldPortIndexPort[];
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Invalid API response');
      }

      return data;
    } catch (error) {
      return this.handleAPIError(error);
    }
  }

  /**
   * Find a port by its UN/LOCODE
   * @param code - UN/LOCODE to search for (e.g., "USNYC", "SGSIN")
   * @returns Promise with port data or null if not found
   */
  public async findByLOCODE(code: string): Promise<WorldPortIndexPort | null> {
    try {
      // Normalize code (uppercase, remove spaces)
      const normalizedCode = code.toUpperCase().replace(/\s/g, '');

      // TEMPORARY: Log input and normalization
      console.log('🔍 [findByLOCODE] Original code:', code);
      console.log('🔍 [findByLOCODE] Normalized code:', normalizedCode);

      // Build query using NestJS CRUD format with filter
      const queryString = `filter=unLocode||$cont||${encodeURIComponent(normalizedCode)}&limit=1`;
      
      // TEMPORARY: Log query string
      console.log('🔍 [findByLOCODE] Query string:', queryString);
      
      // Construct full URL
      const url = `${this.baseURL}/world-port-index?${queryString}`;
      
      // TEMPORARY: Log full URL
      console.log('🔍 [findByLOCODE] Full URL:', url);

      // Make fetch call with timeout
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      // TEMPORARY: Log response
      console.log('📥 [findByLOCODE] Response status:', response.status, response.ok);

      // Check if response is ok
      if (!response.ok) {
        // Try to parse error response body
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          // API returns: {"statusCode": 404, "message": "...", "error": "Not Found"}
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parse fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(`Port API error: ${response.status} - ${errorMessage}`);
      }

      // Parse JSON response (API may return array or { data: array })
      let raw: unknown;
      try {
        raw = await response.json();
      } catch (parseError) {
        throw new Error('Invalid API response');
      }

      const data = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: unknown }).data))
          ? (raw as { data: WorldPortIndexPort[] }).data
          : [];

      if (data.length > 0) return data[0];

      // Fallback: try exact match ($eq) in case API expects equality (e.g. unLocode stored exactly)
      const eqQuery = `filter=unLocode||$eq||${encodeURIComponent(normalizedCode)}&limit=1`;
      const eqUrl = `${this.baseURL}/world-port-index?${eqQuery}`;
      const eqResponse = await fetch(eqUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      });
      if (eqResponse.ok) {
        const eqRaw: unknown = await eqResponse.json();
        const eqData = Array.isArray(eqRaw)
          ? eqRaw
          : (eqRaw && typeof eqRaw === 'object' && 'data' in eqRaw && Array.isArray((eqRaw as { data: unknown }).data))
            ? (eqRaw as { data: WorldPortIndexPort[] }).data
            : [];
        if (eqData.length > 0) return eqData[0];
      }

      return null;
    } catch (error) {
      return this.handleAPIError(error);
    }
  }

  /**
   * Search for ports by name (searches both main and alternate names)
   * @param name - Port name to search for
   * @returns Promise with array of matching ports (max 10)
   */
  public async searchByName(name: string): Promise<WorldPortIndexPort[]> {
    try {
      // Normalize name (lowercase, trim)
      const normalizedName = name.toLowerCase().trim();

      // Strategy: Make TWO API calls (one for each field) and merge results
      // This is needed because the API doesn't support OR queries across fields
      
      // Query 1: Search mainPortName
      const mainQuery = `filter=mainPortName||$cont||${encodeURIComponent(normalizedName)}&limit=10`;
      const mainUrl = `${this.baseURL}/world-port-index?${mainQuery}`;
      
      console.log(`🔍 [searchByName] Searching mainPortName for: "${name}"`);

      const mainResponse = await fetch(mainUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!mainResponse.ok) {
        throw new Error(`Port API error: ${mainResponse.status}`);
      }

      const mainResults: WorldPortIndexPort[] = await mainResponse.json();
      console.log(`📊 [searchByName] mainPortName results: ${mainResults.length}`);
      
      // Query 2: Search alternatePortName
      const altQuery = `filter=alternatePortName||$cont||${encodeURIComponent(normalizedName)}&limit=10`;
      const altUrl = `${this.baseURL}/world-port-index?${altQuery}`;
      
      console.log(`🔍 [searchByName] Searching alternatePortName for: "${name}"`);

      const altResponse = await fetch(altUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!altResponse.ok) {
        throw new Error(`Port API error: ${altResponse.status}`);
      }

      const altResults: WorldPortIndexPort[] = await altResponse.json();
      console.log(`📊 [searchByName] alternatePortName results: ${altResults.length}`);

      // Merge results and deduplicate by unLocode
      const seen = new Set<string>();
      const merged: WorldPortIndexPort[] = [];
      
      for (const port of [...mainResults, ...altResults]) {
        const key = port.unLocode ?? port.mainPortName ?? String(port.OID ?? port.id ?? '');
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(port);
        }
      }
      
      console.log(`✅ [searchByName] Total unique results: ${merged.length}`);
      if (merged.length > 0) {
        console.log(`📊 [searchByName] First result: ${merged[0].mainPortName} (${merged[0].unLocode})`);
      }

      return merged;
    } catch (error) {
      return this.handleAPIError(error);
    }
  }
}

/**
 * Export types for external use
 */
export type {
  WorldPortIndexPort,
  QueryOptions,
  PortQueryOptions,
  Port,
  APIError,
  PortQueryResponse,
};
