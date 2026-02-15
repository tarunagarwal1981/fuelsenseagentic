'use client';

import React from 'react';
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
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import type { ExcessPowerChartData } from '@/lib/services/charts/excess-power-chart-service';

// ============================================================================
// Props
// ============================================================================

interface ExcessPowerChartProps {
  data: ExcessPowerChartData | null;
  height?: number;
  showThresholds?: boolean;
  showTrendLine?: boolean;
  className?: string;
}

// ============================================================================
// Professional Custom Tooltip
// ============================================================================

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-2xl p-4 min-w-[200px]">
      {/* Date Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Date
        </p>
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
          {new Date(data.timestamp).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Excess Power Value */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Excess Power
            </span>
          </div>
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {data.excessPowerPct?.toFixed(2)}%
          </span>
        </div>

        {/* Condition Indicator */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          {data.excessPowerPct < 15 ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 dark:text-green-400">● Good Condition</span>
            </div>
          ) : data.excessPowerPct < 25 ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-yellow-600 dark:text-yellow-400">● Needs Monitoring</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-red-600 dark:text-red-400">● Action Required</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Custom Dot Component (with hover effects)
// ============================================================================

function CustomDot(props: any) {
  const { cx, cy, payload } = props;

  // Color based on value
  let fill = '#3b82f6'; // blue-500
  if (payload.excessPowerPct >= 25) {
    fill = '#ef4444'; // red-500
  } else if (payload.excessPowerPct >= 15) {
    fill = '#f59e0b'; // amber-500
  } else {
    fill = '#10b981'; // green-500
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill}
      fillOpacity={0.8}
      stroke="#fff"
      strokeWidth={1.5}
      className="transition-all duration-200 hover:r-6 cursor-pointer"
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export function ExcessPowerChart({
  data,
  height = 450,
  showThresholds = true,
  showTrendLine = true,
  className = '',
}: ExcessPowerChartProps) {
  if (!data || !data.dataPoints || data.dataPoints.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 ${className} border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl`}
        style={{ height }}
      >
        <svg
          className="w-16 h-16 mb-3 text-gray-400 dark:text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm font-medium">Insufficient data for excess power trend analysis</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Need at least 2 non-zero data points
        </p>
      </div>
    );
  }

  // Generate best-fit line data
  const trendLineData =
    showTrendLine && data.regression
      ? data.dataPoints.map((point) => ({
          timestamp: point.timestamp,
          predicted:
            data.regression!.slope * point.timestamp + data.regression!.intercept,
        }))
      : [];

  // Determine trend quality from R²
  const getTrendQuality = (r2: number) => {
    if (r2 > 0.9) return { label: 'Excellent', color: 'text-green-600' };
    if (r2 > 0.7) return { label: 'Good', color: 'text-blue-600' };
    if (r2 > 0.5) return { label: 'Moderate', color: 'text-yellow-600' };
    return { label: 'Weak', color: 'text-gray-600' };
  };

  const trendQuality = data.regression
    ? getTrendQuality(data.regression.r2)
    : null;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Chart Header */}
      <div className="flex items-start justify-between px-4">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Hull Roughness Power Loss Trend
          </h4>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-600 dark:text-gray-400">
              Trend:{' '}
              {data.statistics.trend === 'improving' ? (
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  📉 Improving
                </span>
              ) : data.statistics.trend === 'degrading' ? (
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  📈 Degrading
                </span>
              ) : (
                <span className="text-gray-600 dark:text-gray-400 font-semibold">
                  ➡️ Stable
                </span>
              )}
            </span>
            {data.metadata?.cleaningStats && (
              <span className="text-gray-500 dark:text-gray-500">
                • {data.metadata.cleaningStats.zerosRemoved} zeros filtered
                {data.metadata.cleaningStats.outliersRemoved > 0 &&
                  ` • ${data.metadata.cleaningStats.outliersRemoved} outliers removed`}
              </span>
            )}
          </div>
        </div>

        {data.regression && (
          <div className="text-right space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Fit Quality:
              </span>
              <span className={`text-xs font-bold ${trendQuality?.color}`}>
                {trendQuality?.label}
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              R² = {data.regression.r2.toFixed(3)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500">
              {data.dataPoints.length} data points
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 20, right: 40, bottom: 70, left: 70 }}>
              {/* Background Zones */}
              {showThresholds && (
                <>
                  <ReferenceArea
                    y1={0}
                    y2={data.thresholds.good}
                    fill="#10b981"
                    fillOpacity={0.03}
                  />
                  <ReferenceArea
                    y1={data.thresholds.good}
                    y2={data.thresholds.poor}
                    fill="#f59e0b"
                    fillOpacity={0.03}
                  />
                  <ReferenceArea
                    y1={data.thresholds.poor}
                    y2={100}
                    fill="#ef4444"
                    fillOpacity={0.03}
                  />
                </>
              )}

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                strokeOpacity={0.3}
                vertical={false}
              />

              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts: number) =>
                  new Date(ts).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                }
                label={{
                  value: 'Date',
                  position: 'insideBottom',
                  offset: -20,
                  style: { fontSize: 13, fontWeight: 700, fill: '#4b5563' },
                }}
                tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                stroke="#9ca3af"
                strokeWidth={1.5}
              />

              <YAxis
                label={{
                  value: 'Excess Power (%)',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 15,
                  style: { fontSize: 13, fontWeight: 700, fill: '#4b5563' },
                }}
                domain={[0, 'auto']}
                tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                stroke="#9ca3af"
                strokeWidth={1.5}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '5 5', stroke: '#9ca3af' }}
              />

              <Legend
                verticalAlign="top"
                height={40}
                iconType="circle"
                wrapperStyle={{ paddingBottom: '10px' }}
                formatter={(value: string) => (
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {value}
                  </span>
                )}
              />

              {/* Threshold lines */}
              {showThresholds && (
                <>
                  <ReferenceLine
                    y={data.thresholds.good}
                    stroke="#10b981"
                    strokeDasharray="8 4"
                    strokeWidth={2}
                    label={{
                      value: `Good (${data.thresholds.good}%)`,
                      position: 'right',
                      fill: '#10b981',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                  <ReferenceLine
                    y={data.thresholds.poor}
                    stroke="#ef4444"
                    strokeDasharray="8 4"
                    strokeWidth={2}
                    label={{
                      value: `Poor (${data.thresholds.poor}%)`,
                      position: 'right',
                      fill: '#ef4444',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                </>
              )}

              {/* Scatter points with custom styling */}
              <Scatter
                name="Actual Excess Power"
                data={data.dataPoints}
                dataKey="excessPowerPct"
                shape={<CustomDot />}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />

              {/* Trend line */}
              {showTrendLine && trendLineData.length > 0 && (
                <Line
                  name="Trend Line"
                  data={trendLineData}
                  dataKey="predicted"
                  stroke="#dc2626"
                  strokeWidth={3}
                  dot={false}
                  type="monotone"
                  strokeDasharray="5 5"
                  isAnimationActive={true}
                  animationDuration={1000}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Enhanced Statistics Summary */}
      <div className="grid grid-cols-4 gap-3 px-4">
        <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
            Mean
          </p>
          <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
            {data.statistics.mean.toFixed(1)}%
          </p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg border border-purple-200 dark:border-purple-800">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
            Std Dev
          </p>
          <p className="text-xl font-bold text-purple-900 dark:text-purple-100 mt-1">
            {data.statistics.stdDev.toFixed(1)}%
          </p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
            Min
          </p>
          <p className="text-xl font-bold text-green-900 dark:text-green-100 mt-1">
            {data.statistics.min.toFixed(1)}%
          </p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
            Max
          </p>
          <p className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">
            {data.statistics.max.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}
