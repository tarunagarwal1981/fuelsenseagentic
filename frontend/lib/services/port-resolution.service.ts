/**
 * Port Resolution Service
 *
 * Resolves port names from user queries to port codes (UN/LOCODE or WPI_*).
 * Used by the route workflow (agent) for port extraction. Uses only World Port Index
 * (Pub150) and SeaRoute API; no ports.json. Respects Agent → Service → Repository.
 */

import type { IWorldPortRepository } from '@/lib/repositories/types';
import { resolvePortNameToCode } from './sea-route-ports';

/** Extract origin and destination query strings from query. Matches "X to Y", "from X to Y", "between X and Y". */
function getOriginDestQueries(query: string): { originQuery: string | null; destQuery: string | null } {
  const trimmed = query.trim();
  const toPattern = /(?:from\s+)?([A-Za-z0-9°\s,\.]+?)\s+to\s+([A-Za-z\s]+)/i;
  const toMatch = trimmed.match(toPattern);
  if (toMatch) {
    return { originQuery: toMatch[1].trim() || null, destQuery: toMatch[2].trim() || null };
  }
  const betweenPattern = /between\s+([A-Za-z0-9°\s,\.]+?)\s+and\s+([A-Za-z\s]+)/i;
  const betweenMatch = trimmed.match(betweenPattern);
  if (betweenMatch) {
    return { originQuery: betweenMatch[1].trim() || null, destQuery: betweenMatch[2].trim() || null };
  }
  return { originQuery: null, destQuery: null };
}

export interface ResolvePortsResult {
  origin: string | null;
  destination: string | null;
  /** Coordinates when origin was resolved (World Port or fallback + findByCode). */
  origin_coordinates?: [number, number];
  /** Coordinates when destination was resolved (World Port or fallback + findByCode). */
  destination_coordinates?: [number, number];
}

export class PortResolutionService {
  constructor(
    private worldPortRepo: IWorldPortRepository,
    private useApiFallback: boolean = true
  ) {}

  /**
   * Resolve origin and destination port codes from a user query.
   * World Port first (getOriginDestQueries + findByName), then optional SeaRoute API fallback.
   */
  async resolvePortsFromQuery(query: string): Promise<ResolvePortsResult> {
    const { originQuery, destQuery } = getOriginDestQueries(query);
    let origin: string | null = null;
    let destination: string | null = null;
    let origin_coordinates: [number, number] | undefined;
    let destination_coordinates: [number, number] | undefined;

    // World Port first
    if (originQuery) {
      try {
        const w = await this.worldPortRepo.findByName(originQuery);
        if (w?.coordinates) {
          origin = w.id;
          origin_coordinates = w.coordinates;
          console.log(`✅ [PORT-RESOLUTION] World Port origin: ${w.id} (${w.name})`);
        }
      } catch (e) {
        console.warn('[PORT-RESOLUTION] World Port findByName(origin) failed:', e instanceof Error ? e.message : e);
      }
    }
    if (destQuery) {
      try {
        const w = await this.worldPortRepo.findByName(destQuery);
        if (w?.coordinates) {
          destination = w.id;
          destination_coordinates = w.coordinates;
          console.log(`✅ [PORT-RESOLUTION] World Port destination: ${w.id} (${w.name})`);
        }
      } catch (e) {
        console.warn('[PORT-RESOLUTION] World Port findByName(destination) failed:', e instanceof Error ? e.message : e);
      }
    }

    if (origin && destination) {
      return { origin, destination, origin_coordinates, destination_coordinates };
    }

    // Optional API fallback for missing parts; enrich with coordinates via findByCode
    if (this.useApiFallback) {
      if (!origin && originQuery) {
        try {
          const code = await resolvePortNameToCode(originQuery);
          if (code) {
            origin = code;
            console.log(`✅ [PORT-RESOLUTION] API fallback origin: ${code}`);
            const entry = await this.worldPortRepo.findByCode(code);
            if (entry?.coordinates && entry.coordinates.length >= 2) {
              origin_coordinates = [entry.coordinates[0], entry.coordinates[1]];
            }
          }
        } catch (e) {
          console.warn('[PORT-RESOLUTION] API fallback origin failed:', e instanceof Error ? e.message : e);
        }
      }
      if (!destination && destQuery) {
        try {
          const code = await resolvePortNameToCode(destQuery);
          if (code) {
            destination = code;
            console.log(`✅ [PORT-RESOLUTION] API fallback destination: ${code}`);
            const entry = await this.worldPortRepo.findByCode(code);
            if (entry?.coordinates && entry.coordinates.length >= 2) {
              destination_coordinates = [entry.coordinates[0], entry.coordinates[1]];
            }
          }
        } catch (e) {
          console.warn('[PORT-RESOLUTION] API fallback destination failed:', e instanceof Error ? e.message : e);
        }
      }
    }

    return { origin, destination, origin_coordinates, destination_coordinates };
  }

  /**
   * Resolve origin and destination port NAMES to codes + coordinates.
   * Use when supervisor/AI extracts port names (e.g. "Singapore", "Fujairah") that must be
   * converted to UN/LOCODE before route calculation.
   */
  async resolvePortsByName(
    origin: string | null | undefined,
    destination: string | null | undefined
  ): Promise<ResolvePortsResult> {
    const result: ResolvePortsResult = {
      origin: null,
      destination: null,
    };

    if (origin && typeof origin === 'string' && origin.trim()) {
      try {
        const w = await this.worldPortRepo.findByName(origin.trim());
        if (w?.coordinates) {
          result.origin = w.code ?? w.id;
          result.origin_coordinates = [w.coordinates[0], w.coordinates[1]];
          console.log(`✅ [PORT-RESOLUTION] World Port origin: ${result.origin} (${w.name})`);
        } else if (this.useApiFallback) {
          const code = await resolvePortNameToCode(origin.trim());
          if (code) {
            result.origin = code;
            const entry = await this.worldPortRepo.findByCode(code);
            if (entry?.coordinates && entry.coordinates.length >= 2) {
              result.origin_coordinates = [entry.coordinates[0], entry.coordinates[1]];
            }
            console.log(`✅ [PORT-RESOLUTION] API fallback origin: ${code}`);
          }
        }
      } catch (e) {
        console.warn('[PORT-RESOLUTION] findByName(origin) failed:', e instanceof Error ? e.message : e);
      }
    }

    if (destination && typeof destination === 'string' && destination.trim()) {
      try {
        const w = await this.worldPortRepo.findByName(destination.trim());
        if (w?.coordinates) {
          result.destination = w.code ?? w.id;
          result.destination_coordinates = [w.coordinates[0], w.coordinates[1]];
          console.log(`✅ [PORT-RESOLUTION] World Port destination: ${result.destination} (${w.name})`);
        } else if (this.useApiFallback) {
          const code = await resolvePortNameToCode(destination.trim());
          if (code) {
            result.destination = code;
            const entry = await this.worldPortRepo.findByCode(code);
            if (entry?.coordinates && entry.coordinates.length >= 2) {
              result.destination_coordinates = [entry.coordinates[0], entry.coordinates[1]];
            }
            console.log(`✅ [PORT-RESOLUTION] API fallback destination: ${code}`);
          }
        }
      } catch (e) {
        console.warn('[PORT-RESOLUTION] findByName(destination) failed:', e instanceof Error ? e.message : e);
      }
    }

    return result;
  }

  /**
   * Get coordinates for a port code (UN/LOCODE or WPI_*). Used by route-validator.
   */
  async getCoordinatesForPort(code: string): Promise<{ lat: number; lon: number } | null> {
    const entry = await this.worldPortRepo.findByCode(code);
    if (!entry?.coordinates || entry.coordinates.length < 2) return null;
    return { lat: entry.coordinates[0], lon: entry.coordinates[1] };
  }
}
