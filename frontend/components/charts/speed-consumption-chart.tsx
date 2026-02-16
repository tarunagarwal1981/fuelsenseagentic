'use client';

import React, { useState, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SpeedConsumptionChartData } from '@/lib/services/charts/speed-consumption-chart-service';
import { generateExponentialCurve } from '@/lib/utils/exponential-regression';

/** Recharts may pass Cartesian or Polar viewBox; we only use Cartesian. */
type CartesianViewBox = { x: number; y: number; width: number; height: number };

function YAxisLabel({
  viewBox,
  value,
  fill = '#4b5563',
}: {
  viewBox?: CartesianViewBox | { [key: string]: unknown };
  value?: string;
  fill?: string;
}) {
  const vb = viewBox as CartesianViewBox | undefined;
  if (!vb || typeof vb.x !== 'number' || typeof vb.y !== 'number' || typeof vb.height !== 'number' || !value) return null;
  const x = vb.x + 4;
  const y = vb.y + vb.height / 2;
  return (
    <text x={x} y={y} textAnchor="middle" fill={fill} fontSize={10} fontWeight={600} transform={`rotate(-90, ${x}, ${y})`}>
      {value}
    </text>
  );
}

const TEAL = '#14b8a6';
const BALLAST_BASELINE = '#3b82f6';
const LADEN_BASELINE = '#22c55e';

interface SpeedConsumptionChartProps {
  data: SpeedConsumptionChartData;
  height?: number;
  className?: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { speed: number; consumption: number; date?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 min-w-[160px]">
      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
        {p.date != null && p.date !== '' && (
          <p><span className="font-medium text-gray-700 dark:text-gray-300">Date:</span>{' '}
            {new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        )}
        <p><span className="font-medium text-gray-700 dark:text-gray-300">Speed:</span> {Number(p.speed).toFixed(1)} kts</p>
        <p><span className="font-medium text-gray-700 dark:text-gray-300">Consumption:</span> {Number(p.consumption).toFixed(2)} MT/day</p>
      </div>
    </div>
  );
}

function ActualDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={TEAL}
      fillOpacity={0.6}
      stroke={TEAL}
      strokeWidth={1}
    />
  );
}

function DiamondDot(props: { cx?: number; cy?: number; color: string }) {
  const { cx, cy, color } = props;
  if (cx == null || cy == null) return null;
  const r = 5;
  const path = `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
  return (
    <path
      d={path}
      fill={color}
      fillOpacity={0.4}
      stroke={color}
      strokeWidth={1}
    />
  );
}

function isValidChartData(data: SpeedConsumptionChartData): boolean {
  return (
    data != null &&
    typeof data === 'object' &&
    data.ballast != null &&
    data.laden != null &&
    data.statistics != null &&
    data.statistics.ballast != null &&
    data.statistics.laden != null
  );
}

export function SpeedConsumptionChart({
  data,
  height = 450,
  className = '',
}: SpeedConsumptionChartProps) {
  const [selectedCondition, setSelectedCondition] = useState<'ballast' | 'laden'>('ballast');

  if (!isValidChartData(data)) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 ${className}`}
        style={{ height: height + 80 }}
      >
        <p className="text-sm font-medium">Chart data is loading or unavailable</p>
      </div>
    );
  }

  const section = data[selectedCondition];
  const stats = data.statistics[selectedCondition];
  const baselineColor = selectedCondition === 'ballast' ? BALLAST_BASELINE : LADEN_BASELINE;

  const hasActual = section?.actual?.dataPoints?.length > 0;
  const hasBaseline = section?.baseline?.dataPoints?.length > 0;
  const hasAnyData = (data.statistics.ballast.dataPoints > 0) || (data.statistics.laden.dataPoints > 0);
  const hasSectionData = hasActual || hasBaseline;

  const actualScatterData = useMemo(
    () =>
      section.actual.dataPoints.map((p) => ({
        speed: p.speed,
        consumption: p.consumption,
        date: p.date,
      })),
    [section.actual.dataPoints]
  );
  const baselineScatterData = useMemo(
    () => section.baseline.dataPoints.map((p) => ({ speed: p.speed, consumption: p.consumption })),
    [section.baseline.dataPoints]
  );

  const speedDomain = useMemo(() => {
    const hardMaxSpeed = data.axisLimits?.maxSpeed ?? 25;
    const speeds = [
      ...section.actual.dataPoints.map((p) => p.speed),
      ...section.baseline.dataPoints.map((p) => p.speed),
    ].filter(Number.isFinite);
    if (speeds.length === 0) return [0, hardMaxSpeed];
    const min = Math.max(0, Math.min(...speeds));
    const max = Math.min(hardMaxSpeed, Math.max(...speeds));
    const pad = (max - min) * 0.05 || 0.5;
    return [Math.max(0, min - pad), Math.min(hardMaxSpeed, max + pad)];
  }, [section.actual.dataPoints, section.baseline.dataPoints, data.axisLimits?.maxSpeed]);

  const consumptionDomain = useMemo(() => {
    const hardMaxConsumption = data.axisLimits?.maxConsumption ?? 200;
    const consumptions = [
      ...section.actual.dataPoints.map((p) => p.consumption),
      ...section.baseline.dataPoints.map((p) => p.consumption),
    ].filter(Number.isFinite);
    if (consumptions.length === 0) return [0, hardMaxConsumption];
    const min = Math.max(0, Math.min(...consumptions));
    const max = Math.min(hardMaxConsumption, Math.max(...consumptions));
    const pad = (max - min) * 0.05 || 0.5;
    return [Math.max(0, min - pad), Math.min(hardMaxConsumption, max + pad)];
  }, [section.actual.dataPoints, section.baseline.dataPoints, data.axisLimits?.maxConsumption]);

  const [minSpeed, maxSpeed] = speedDomain;
  const maxConsumptionY = data.axisLimits?.maxConsumption ?? 200;

  const actualCurveData = useMemo(() => {
    if (!section.actual.exponentialFit || section.actual.dataPoints.length < 2) return [];
    const { a, b } = section.actual.exponentialFit;
    const points = generateExponentialCurve(a, b, minSpeed, maxSpeed, 50);
    return points.map((p) => ({
      speed: p.x,
      consumption: Math.max(0, Math.min(maxConsumptionY, p.y)),
    }));
  }, [section.actual.exponentialFit, section.actual.dataPoints.length, minSpeed, maxSpeed, maxConsumptionY]);

  const baselineCurveData = useMemo(() => {
    const pts = section.baseline.dataPoints;
    if (section.baseline.exponentialFit) {
      const { a, b } = section.baseline.exponentialFit;
      const points = generateExponentialCurve(a, b, minSpeed, maxSpeed, 50);
      return points.map((p) => ({
        speed: p.x,
        consumption: Math.max(0, Math.min(maxConsumptionY, p.y)),
      }));
    }
    if (pts.length === 2) {
      const sorted = [...pts].sort((a, b) => a.speed - b.speed);
      return sorted.map((p) => ({
        speed: p.speed,
        consumption: Math.max(0, Math.min(maxConsumptionY, p.consumption)),
      }));
    }
    return [];
  }, [section.baseline.exponentialFit, section.baseline.dataPoints, minSpeed, maxSpeed, maxConsumptionY]);

  const ballastCount = data.statistics.ballast.dataPoints;
  const ladenCount = data.statistics.laden.dataPoints;

  if (!hasAnyData) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 ${className} border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50`}
        style={{ height: height + 120 }}
      >
        <p className="text-sm font-medium">No data available</p>
        <p className="text-xs mt-1">Select a condition with speed-consumption points to view the chart.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {hasActual && !hasBaseline && (
        <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Baseline curves are available when using the Hull Performance API (not when using DB source).
        </p>
      )}
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSelectedCondition('ballast')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border-2 ${
            selectedCondition === 'ballast'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          Ballast ({ballastCount})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCondition('laden')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border-2 ${
            selectedCondition === 'laden'
              ? 'border-green-500 bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          Laden ({ladenCount})
        </button>
      </div>

      {/* Statistics: Avg Speed (1 dec), Avg Consumption (2 dec), Data Points; no correlation, no curve equations */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Speed</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.avgSpeed.toFixed(1)}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Consumption</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.avgConsumption.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Data Points</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.dataPoints}</p>
        </div>
      </div>

      {/* Chart - consistent margins for placement inside card */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 overflow-hidden">
        {!hasSectionData ? (
          <div
            className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400"
            style={{ height }}
          >
            <p className="text-sm font-medium">No data available for this condition</p>
          </div>
        ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 10, right: 12, bottom: 32, left: 54 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" strokeOpacity={0.5} />
              <XAxis
                type="number"
                dataKey="speed"
                name="Speed (kts)"
                domain={speedDomain}
                allowDataOverflow
                tickFormatter={(v) => Number(v).toFixed(1)}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                label={{
                  value: 'Speed (kts)',
                  position: 'insideBottom',
                  offset: -14,
                  style: { fontSize: 11, fontWeight: 600, fill: 'currentColor' },
                }}
                className="text-gray-600 dark:text-gray-400"
              />
              <YAxis
                type="number"
                dataKey="consumption"
                name="Consumption (MT/day)"
                domain={consumptionDomain}
                allowDataOverflow
                tickFormatter={(v) => Number(v).toFixed(2)}
                tick={{ fontSize: 10, fill: 'currentColor' }}
                label={{ value: 'Consumption (MT/day)', content: ((props: unknown) => <YAxisLabel {...(props as React.ComponentProps<typeof YAxisLabel>)} fill="currentColor" />) as unknown as React.ReactElement }}
                className="text-gray-600 dark:text-gray-400"
                width={42}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '5 5', stroke: '#9ca3af' }} />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                formatter={(value: string) => (
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{value}</span>
                )}
              />

              {actualCurveData.length > 0 && (
                <Line
                  name="Actual fit"
                  data={actualCurveData}
                  dataKey="consumption"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              )}
              {baselineCurveData.length > 0 && (
                <Line
                  name="Baseline fit"
                  data={baselineCurveData}
                  dataKey="consumption"
                  stroke={baselineColor}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              )}

              {hasActual && (
                <Scatter
                  name="Actual"
                  data={actualScatterData}
                  fill={TEAL}
                  fillOpacity={0.6}
                  shape={<ActualDot />}
                />
              )}
              {hasBaseline && (
                <Scatter
                  name="Baseline"
                  data={baselineScatterData}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <DiamondDot {...props} color={baselineColor} />
                  )}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
    </div>
  );
}
