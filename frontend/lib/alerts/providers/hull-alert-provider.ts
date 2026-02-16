/**
 * Hull alert provider (alerts module).
 * Uses domain layer only: HullPerformanceService, VesselDetailsClient.
 * Does not touch the agentic AI system.
 */

import path from 'path';
import { config as loadEnv } from 'dotenv';
import type { AlertItem, AlertProvider } from '@/lib/types/alerts';
import { HullPerformanceService } from '@/lib/services/hull-performance-service';
import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { RedisCache } from '@/lib/repositories/cache-client';
import {
  HullPerformanceClient,
  type IHullPerformanceDataSource,
} from '@/lib/api-clients/hull-performance-client';
import { HullPerformanceDbClient } from '@/lib/api-clients/hull-performance-db-client';
import { VesselDetailsClient } from '@/lib/clients/vessel-details-client';

const DEFAULT_VESSEL_LIMIT = 100;
const CONCURRENCY = 8;

/** Format report_date (YYYY-MM-DD or ISO string) to "Date: DD MMM". Handles invalid/missing dates. */
function formatAlertDate(reportDate: unknown): string {
  if (reportDate == null || String(reportDate).trim() === '') return 'Date: —';
  const str = String(reportDate).trim();
  const d = str.includes('T') ? new Date(str) : new Date(str + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'Date: —';
  const day = d.getUTCDate();
  const monthIndex = d.getUTCMonth();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[monthIndex] ?? '—';
  return `Date: ${day} ${month}`;
}

/**
 * Run hull analysis for one vessel and return an AlertItem if condition is POOR.
 */
async function getHullAlertForVessel(
  vessel: { imo: string; name: string },
  service: HullPerformanceService,
  correlationId: string
): Promise<AlertItem | null> {
  const analysis = await service.analyzeVesselPerformance(
    { imo: vessel.imo || undefined, name: vessel.name || undefined },
    { includeBaseline: false }
  );
  if (analysis == null || analysis.hull_condition !== 'POOR') return null;

  const reportDate = analysis.latest_metrics?.report_date ?? '';
  const imo = analysis.vessel?.imo ?? vessel.imo ?? 'unknown';
  const id = `hull_${imo}_${reportDate}`;
  const vesselName = analysis.vessel?.name || vessel.name || 'Unknown vessel';
  const message = analysis.condition_message ?? 'Hull heavily fouled - schedule cleaning immediately';
  const excessPct = analysis.latest_metrics?.excess_power_pct;

  return {
    id,
    source: 'hull',
    vesselName,
    date: formatAlertDate(reportDate),
    message,
    metric: excessPct != null ? Number(excessPct) : undefined,
    createdAt: Date.now(),
  };
}

/**
 * Process vessels in chunks with concurrency limit.
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export const hullAlertProvider: AlertProvider = {
  name: 'hull',

  async getAlerts(options?: { vesselLimit?: number; correlationId?: string }): Promise<AlertItem[]> {
    const vesselLimit = options?.vesselLimit ?? DEFAULT_VESSEL_LIMIT;
    const correlationId = options?.correlationId ?? `alerts-hull-${Date.now()}`;

    if (typeof process !== 'undefined' && process.cwd) {
      const cwd = process.cwd();
      const hasHullEnv =
        process.env.HULL_PERFORMANCE_SOURCE != null || process.env.HULL_PERFORMANCE_DB_HOST != null;
      if (!hasHullEnv) {
        try {
          loadEnv({ path: path.resolve(cwd, '.env') });
          loadEnv({ path: path.resolve(cwd, '..', '.env') });
        } catch {
          // ignore
        }
      }
    }

    const vesselClient = new VesselDetailsClient();
    let vessels: { imo: string; name: string }[];
    try {
      const list = await vesselClient.getAll(vesselLimit);
      vessels = list.map((v) => ({ imo: v.imo, name: v.name }));
    } catch (err) {
      console.warn('[hull-alert-provider] Vessel list failed:', err);
      return [];
    }

    if (vessels.length === 0) return [];

    const container = ServiceContainer.getInstance();
    const cache = container.getCache() as RedisCache;
    const useDb = process.env.HULL_PERFORMANCE_SOURCE === 'db';
    const client: IHullPerformanceDataSource = useDb
      ? new HullPerformanceDbClient(correlationId)
      : new HullPerformanceClient(correlationId);
    const repository = new HullPerformanceRepository(correlationId, { client, redis: cache });
    const service = new HullPerformanceService(correlationId, repository);

    const rawResults = await processWithConcurrency(
      vessels,
      CONCURRENCY,
      (vessel) => getHullAlertForVessel(vessel, service, correlationId)
    );

    const alerts = rawResults.filter((a): a is AlertItem => a != null);
    return alerts;
  },
};
