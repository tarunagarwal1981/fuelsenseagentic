/**
 * Debug Logger Utility
 * 
 * Provides structured logging for port identification and route calculation flow.
 * Helps debug issues by tracing queries through the system.
 */

const DEBUG_ENABLED = process.env.NEXT_PUBLIC_DEBUG_PORT_ID === 'true' || process.env.NODE_ENV === 'development';

// Generate unique request ID for session tracking
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

let currentRequestId: string | null = null;

/**
 * Start a new logging session for a query
 */
export function startLoggingSession(): string {
  currentRequestId = generateRequestId();
  return currentRequestId;
}

/**
 * Get current request ID
 */
function getRequestId(): string {
  if (!currentRequestId) {
    currentRequestId = generateRequestId();
  }
  return currentRequestId;
}

/**
 * Format log message with prefix and request ID
 */
function formatLog(prefix: string, message: string, data?: any): void {
  if (!DEBUG_ENABLED) return;
  
  const requestId = getRequestId();
  const timestamp = new Date().toISOString();
  const logMessage = `[${prefix}] [${requestId}] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

/**
 * Port Logger - Structured logging for port identification flow
 */
export const PortLogger = {
  /**
   * Log query start
   */
  logQuery: (query: string, context?: any) => {
    formatLog('PORT-ID', `Query: "${query}"`, context);
  },

  /**
   * Log coordinate extraction
   */
  logCoordinateExtraction: (coords: { lat: number; lon: number } | null, source: string) => {
    if (coords) {
      formatLog('COORD-PARSE', `Coordinates extracted: ${coords.lat}°N, ${coords.lon}°E (source: ${source})`);
    } else {
      formatLog('COORD-PARSE', 'No coordinates found in query');
    }
  },

  /**
   * Log port identification result
   */
  logPortIdentification: (origin: string, dest: string, method: string) => {
    formatLog('PORT-ID', `Identified: ${origin} → ${dest} (method: ${method})`);
  },

  /**
   * Log port resolution (static vs API)
   */
  logPortResolution: (code: string, coords: { lat: number; lon: number }, source: 'static' | 'api') => {
    formatLog('PORT-RESOLVE', `Resolved ${code}: ${coords.lat}°N, ${coords.lon}°E (source: ${source})`);
  },

  /**
   * Log route calculation
   */
  logRouteCalculation: (origin: string, dest: string, distance: number, waypoints: number) => {
    formatLog('ROUTE-CALC', `Calculating: ${origin} → ${dest}`);
    formatLog('ROUTE-CALC', `Result: ${distance.toFixed(0)}nm, ${waypoints} waypoints`);
  },

  /**
   * Log route validation
   */
  logValidation: (result: { valid: boolean; warnings: string[] }) => {
    if (result.valid && result.warnings.length === 0) {
      formatLog('VALIDATION', '✓ Route valid, no warnings');
    } else if (result.warnings.length > 0) {
      formatLog('VALIDATION', `⚠ Route validation warnings:`, result.warnings);
    } else {
      formatLog('VALIDATION', '✗ Route validation failed');
    }
  },

  /**
   * Log errors
   */
  logError: (stage: string, error: any) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    formatLog('ERROR', `[${stage}] ${errorMessage}`, error);
  },

  /**
   * Log map display issues
   */
  logMapDisplay: (message: string, data?: any) => {
    formatLog('MAP-DISPLAY', message, data);
  },
};

