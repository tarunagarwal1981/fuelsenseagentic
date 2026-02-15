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
import { generatePolynomialCurve } from '@/lib/utils/polynomial-regression';

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

export function SpeedConsumptionChart({
  data,
  height = 450,
  className = '',
}: SpeedConsumptionChartProps) {
  const [selectedCondition, setSelectedCondition] = useState<'ballast' | 'laden'>('ballast');

  const section = data[selectedCondition];
  const stats = data.statistics[selectedCondition];
  const baselineColor = selectedCondition === 'ballast' ? BALLAST_BASELINE : LADEN_BASELINE;

  const hasActual = section.actual.dataPoints.length > 0;
  const hasBaseline = section.baseline.dataPoints.length > 0;
  const hasAnyData = data.statistics.ballast.dataPoints > 0 || data.statistics.laden.dataPoints > 0;
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
    const speeds = [
      ...section.actual.dataPoints.map((p) => p.speed),
      ...section.baseline.dataPoints.map((p) => p.speed),
    ].filter(Number.isFinite);
    if (speeds.length === 0) return [0, 15];
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    const pad = (max - min) * 0.05 || 0.5;
    return [Math.max(0, min - pad), max + pad];
  }, [section.actual.dataPoints, section.baseline.dataPoints]);

  const [minSpeed, maxSpeed] = speedDomain;

  const actualCurveData = useMemo(() => {
    if (!section.actual.polynomialFit || section.actual.dataPoints.length < 3) return [];
    const points = generatePolynomialCurve(
      section.actual.polynomialFit.coefficients,
      minSpeed,
      maxSpeed,
      50
    );
    return points.map((p) => ({ speed: p.x, consumption: p.y }));
  }, [section.actual.polynomialFit, section.actual.dataPoints.length, minSpeed, maxSpeed]);

  const baselineCurveData = useMemo(() => {
    if (!section.baseline.polynomialFit || section.baseline.dataPoints.length < 3) return [];
    const points = generatePolynomialCurve(
      section.baseline.polynomialFit.coefficients,
      minSpeed,
      maxSpeed,
      50
    );
    return points.map((p) => ({ speed: p.x, consumption: p.y }));
  }, [section.baseline.polynomialFit, section.baseline.dataPoints.length, minSpeed, maxSpeed]);

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

      {/* Statistics grid: 4 cols desktop, 2 mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Speed</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.avgSpeed.toFixed(1)} kts</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Consumption</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.avgConsumption.toFixed(2)} MT/day</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Correlation</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.correlation.toFixed(3)}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Data Points</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stats.dataPoints}</p>
        </div>
      </div>

      {/* Polynomial equations */}
      {(section.actual.polynomialFit || section.baseline.polynomialFit) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {section.actual.polynomialFit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
              <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-teal-500" aria-hidden />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">Actual</p>
                <p className="text-gray-600 dark:text-gray-400 font-mono text-xs break-all">{section.actual.polynomialFit.equation_text}</p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-0.5">R² = {section.actual.polynomialFit.r_squared.toFixed(3)}</p>
              </div>
            </div>
          )}
          {section.baseline.polynomialFit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
              <span
                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: baselineColor }}
                aria-hidden
              />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">Baseline</p>
                <p className="text-gray-600 dark:text-gray-400 font-mono text-xs break-all">{section.baseline.polynomialFit.equation_text}</p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-0.5">R² = {section.baseline.polynomialFit.r_squared.toFixed(3)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4">
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
            <ScatterChart margin={{ top: 20, right: 24, bottom: 24, left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" strokeOpacity={0.5} />
              <XAxis
                type="number"
                dataKey="speed"
                name="Speed"
                unit=" kts"
                domain={speedDomain}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-gray-600 dark:text-gray-400"
              />
              <YAxis
                type="number"
                dataKey="consumption"
                name="Consumption"
                unit=" MT/day"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-gray-600 dark:text-gray-400"
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
