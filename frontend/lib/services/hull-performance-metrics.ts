/**
 * Hull Performance Metrics Service
 *
 * Computes the canonical "current" excess power % and speed loss % for a vessel.
 * These metrics are defined as: last (rightmost) y-value of the linear best-fit line
 * over the last N months of scatter data (default 6 months). Prefer these values over
 * raw hull_roughness_power_loss / hull_roughness_speed_loss from the table when
 * displaying "current" excess power or speed loss (alerts, agent responses, cards).
 */

import type { HullPerformanceRecord } from '@/lib/api-clients/hull-performance-client';

export interface ExcessPowerAndSpeedLossResult {
  excessPowerPct: number;
  speedLossPct: number;
}

/**
 * Linear regression over (timestamp, value) points; returns y at the last (max) x.
 * If n < 2, returns the last point's value or 0 if no valid points.
 */
function lastYFromLinearRegression(
  points: Array<{ x: number; y: number }>
): number {
  const valid = points.filter(
    (p) => typeof p.y === 'number' && Number.isFinite(p.y)
  );
  if (valid.length === 0) return 0;
  if (valid.length === 1) return valid[0].y;

  const n = valid.length;
  const xs = valid.map((p) => p.x);
  const ys = valid.map((p) => p.y);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const meanY = sumY / n;
  const meanX = sumX / n;
  const intercept = meanY - slope * meanX;

  const lastX = Math.max(...xs);
  return slope * lastX + intercept;
}

/** IQR-based outlier bounds (same as chart service: 3x IQR). */
function getOutlierBounds(values: number[], iqrMultiplier: number): { lower: number; upper: number } | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  return {
    lower: q1 - iqrMultiplier * iqr,
    upper: q3 + iqrMultiplier * iqr,
  };
}

/**
 * Clean points the same way as the chart: remove zeros and outliers (IQR, 3x).
 * So the regression "last y" matches the chart's trend line end value.
 */
function cleanPointsLikeChart(
  points: Array<{ x: number; y: number }>,
  options: { removeZeros?: boolean; removeOutliers?: boolean; outlierThreshold?: number }
): Array<{ x: number; y: number }> {
  const removeZeros = options.removeZeros ?? true;
  const removeOutliers = options.removeOutliers ?? true;
  const outlierThreshold = options.outlierThreshold ?? 3.0;

  let out = points.filter((p) => typeof p.y === 'number' && Number.isFinite(p.y));
  if (removeZeros) out = out.filter((p) => p.y !== 0);
  if (removeOutliers && out.length >= 4) {
    const ys = out.map((p) => p.y);
    const bounds = getOutlierBounds(ys, outlierThreshold);
    if (bounds) {
      out = out.filter((p) => p.y >= bounds.lower && p.y <= bounds.upper);
    }
  }
  return out;
}

/**
 * Get excess power % and speed loss % from the last y-value of the linear best-fit
 * over the last N months of data. Uses the same cleaning as the chart (remove zeros,
 * remove outliers via IQR 3x) so the displayed value matches the chart's trend line end.
 *
 * When metrics must be independent of user-selected period, the caller should pass
 * records that are already restricted to "last 6 months from the vessel's last report
 * date" (e.g. HullPerformanceService passes recordsForMetrics for this).
 *
 * @param records - Hull performance records (already filtered for vessel; no extra I/O).
 * @param options - Optional; defaults to last 6 months.
 * @returns excessPowerPct and speedLossPct. If after cleaning there are 0 or 1 valid
 *   points for a series, returns the last available value for that series (or 0 if none).
 */
export function getExcessPowerAndSpeedLossFromBestFit(
  records: HullPerformanceRecord[],
  options?: { months?: number }
): ExcessPowerAndSpeedLossResult {
  const months = options?.months ?? 6;
  if (records.length === 0) {
    return { excessPowerPct: 0, speedLossPct: 0 };
  }

  const latestDate = records.reduce((max, r) => {
    const t = new Date(r.report_date).getTime();
    return t > max ? t : max;
  }, 0);
  const cutoff = new Date(latestDate);
  cutoff.setMonth(cutoff.getMonth() - months);

  const inWindow = records.filter(
    (r) => new Date(r.report_date).getTime() >= cutoff.getTime()
  );
  const sorted = [...inWindow].sort(
    (a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
  );

  const excessPowerPointsRaw = sorted
    .filter(
      (r) =>
        r.hull_roughness_power_loss != null &&
        Number.isFinite(r.hull_roughness_power_loss)
    )
    .map((r) => ({
      x: new Date(r.report_date).getTime(),
      y: r.hull_roughness_power_loss,
    }));

  const speedLossPointsRaw = sorted
    .filter(
      (r) =>
        r.hull_roughness_speed_loss != null &&
        Number.isFinite(r.hull_roughness_speed_loss)
    )
    .map((r) => ({
      x: new Date(r.report_date).getTime(),
      y: r.hull_roughness_speed_loss,
    }));

  const excessPowerPoints = cleanPointsLikeChart(excessPowerPointsRaw, {
    removeZeros: true,
    removeOutliers: true,
    outlierThreshold: 3.0,
  });
  const speedLossPoints = cleanPointsLikeChart(speedLossPointsRaw, {
    removeZeros: true,
    removeOutliers: true,
    outlierThreshold: 3.0,
  });

  const excessPowerPct = lastYFromLinearRegression(excessPowerPoints);
  const speedLossPct = lastYFromLinearRegression(speedLossPoints);

  return { excessPowerPct, speedLossPct };
}
