/**
 * Client-safe types for component adapters (HybridResponseRenderer).
 * Avoids importing from response-formatter which pulls in fs/template deps.
 */

export interface ComplianceCardData {
  hasECAZones: boolean;
  severity: 'none' | 'info' | 'warning';
  ecaDetails?: {
    zonesCount: number;
    zones: Array<{
      name: string;
      code: string;
      distanceNM: number;
      durationHours: number;
      percentOfRoute: number;
      mgoRequiredMT: number;
    }>;
    totalMGOMT: number;
    complianceCostUSD: number;
    switchingPoints: Array<{
      action: string;
      timeFromStartHours: number;
      timeFromStartFormatted: string;
      location: { lat: number; lon: number };
      locationFormatted: string;
    }>;
    warnings: string[];
  };
  noECAMessage?: { title: string; description: string };
}

export interface TimelineData {
  events: Array<{
    hourFromStart: number;
    hourFormatted: string;
    type: 'DEPARTURE' | 'BUNKER' | 'SWITCH_FUEL' | 'ARRIVAL';
    icon: string;
    title: string;
    description: string;
    location?: { lat: number; lon: number };
    locationFormatted?: string;
    actionRequired: boolean;
  }>;
}
