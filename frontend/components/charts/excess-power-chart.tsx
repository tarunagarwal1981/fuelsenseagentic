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
  ReferenceArea,
} from 'recharts';
import type { ExcessPowerChartData } from '@/lib/services/charts/excess-power-chart-service';

/** Custom Y-axis label: left-aligned in margin so it doesn't overlap tick values */
function YAxisLabel({
  viewBox,
  value,
  fill = '#4b5563',
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
  value?: string;
  fill?: string;
}) {
  if (!viewBox || !value) return null;
  const x = viewBox.x + 6;
  const y = viewBox.y + viewBox.height / 2;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={fill}
      fontSize={11}
      fontWeight={600}
      transform={`rotate(-90, ${x}, ${y})`}
    >
      {value}
    </text>
  );
}

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

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Chart Header: trend only; no R², fit quality, zeros filtered */}
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
          </div>
        </div>
      </div>

      {/* Chart - consistent margins for placement inside card */}
      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 10, right: 12, bottom: 32, left: 44 }}>
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
                  offset: -14,
                  style: { fontSize: 11, fontWeight: 600, fill: '#4b5563' },
                }}
                tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                stroke="#9ca3af"
                strokeWidth={1.5}
              />

              <YAxis
                label={{ value: 'Excess Power (%)', content: (props: { viewBox?: { x: number; y: number; width: number; height: number }; value?: string }) => <YAxisLabel {...props} fill="#4b5563" /> }}
                domain={[0, 'auto']}
                tick={{ fontSize: 10, fill: '#6b7280', fontWeight: 500 }}
                stroke="#9ca3af"
                strokeWidth={1.5}
                width={32}
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

              {/* No threshold lines (background zones only, like speed loss) */}

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
    </div>
  );
}
