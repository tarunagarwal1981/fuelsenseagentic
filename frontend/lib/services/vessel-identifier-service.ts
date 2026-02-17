/**
 * Vessel Identifier Service (Option A: vessel_details API only)
 *
 * Shared service for resolving vessel name to IMO or IMO to vessel name.
 * Uses VesselDetailsClient (vessel_details API) only; no Supabase.
 * Used by bunker, vessel_info, hull_performance, and any agent that needs
 * name-to-IMO or IMO-to-name resolution.
 */

import { VesselDetailsClient } from '@/lib/clients/vessel-details-client';
import type { VesselBasicInfo } from '@/lib/types/vessel-performance';
import type { DataPolicyConfig } from '@/lib/types/config';

const vesselDetailsClient = new VesselDetailsClient();

export interface ResolveVesselResult {
  imo: string | null;
  name: string | null;
  vessel?: VesselBasicInfo;
}

/**
 * Resolve vessel name to IMO and/or IMO to name using vessel_details API only.
 * If policy is provided and vessel_identifier_source is not vessel_details_api, returns nulls
 * (Option A is the only supported source).
 *
 * @param input - { name?: string, imo?: string } - at least one required
 * @param policy - Optional data-policy (if present and source is vessel_details_api, use API)
 * @returns { imo, name, vessel? } - vessel is full VesselBasicInfo when available
 */
export async function resolveVesselIdentifier(
  input: { name?: string; imo?: string },
  policy?: DataPolicyConfig | null
): Promise<ResolveVesselResult> {
  const name = input.name?.trim();
  const imo = input.imo?.trim();

  if (!name && !imo) {
    return { imo: null, name: null };
  }

  // Option A only: vessel_details_api. If policy specifies something else, we still only support API.
  if (policy?.vessel_identifier_source && policy.vessel_identifier_source !== 'vessel_details_api') {
    return { imo: null, name: null };
  }

  try {
    if (imo) {
      const vessel = await vesselDetailsClient.getByIMO(imo);
      if (vessel) {
        return {
          imo: vessel.imo ?? imo,
          name: vessel.name ?? null,
          vessel,
        };
      }
      return { imo, name: null };
    }
    if (name) {
      const vessel = await vesselDetailsClient.getByName(name);
      if (vessel) {
        return {
          imo: vessel.imo ?? null,
          name: vessel.name ?? name,
          vessel,
        };
      }
      return { imo: null, name };
    }
  } catch (err) {
    console.warn('[VesselIdentifierService] resolve failed:', err instanceof Error ? err.message : err);
    return { imo: imo ?? null, name: name ?? null };
  }

  return { imo: null, name: null };
}

/**
 * Get IMO from vessel name using vessel_details API. Convenience for callers that only need IMO.
 */
export async function getIMOFromName(vesselName: string, _policy?: DataPolicyConfig | null): Promise<string | null> {
  const result = await resolveVesselIdentifier({ name: vesselName }, _policy ?? undefined);
  return result.imo;
}

/**
 * Get vessel name from IMO using vessel_details API. Convenience for callers that only need name.
 */
export async function getNameFromIMO(imo: string, _policy?: DataPolicyConfig | null): Promise<string | null> {
  const result = await resolveVesselIdentifier({ imo }, _policy ?? undefined);
  return result.name;
}
