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
// Custom Tooltip
// ============================================================================

interface TooltipPayloadItem {
  payload?: { timestamp?: number; excessPowerPct?: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {new Date(data.timestamp ?? 0).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-gray-600 dark:text-gray-400">Excess Power:</span>
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {data.excessPowerPct?.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ExcessPowerChart({
  data,
  height = 400,
  showThresholds = true,
  showTrendLine = true,
  className = '',
}: ExcessPowerChartProps) {
  if (!data || !data.dataPoints || data.dataPoints.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
        style={{ height }}
      >
        <p className="text-sm">Insufficient data for excess power trend analysis</p>
      </div>
    );
  }

  // Generate best-fit line data
  const trendLineData =
    showTrendLine && data.regression
      ? data.dataPoints.map(point => ({
          timestamp: point.timestamp,
          predicted: data.regression.slope * point.timestamp + data.regression.intercept,
        }))
      : [];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Chart Header */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Hull Roughness Power Loss Trend
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Trend: {data.statistics.trend === 'improving' ? '📉 Improving' : data.statistics.trend === 'degrading' ? '📈 Degrading' : '➡️ Stable'}
          </p>
        </div>
        {data.regression && (
          <div className="text-right">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              R² = {data.regression.r2.toFixed(3)}
            </span>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {data.dataPoints.length} points
            </p>
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={ts =>
                new Date(ts).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              }
              label={{
                value: 'Date',
                position: 'insideBottom',
                offset: -15,
                style: { fontSize: 12, fontWeight: 600, fill: '#6b7280' },
              }}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />

            <YAxis
              label={{
                value: 'Excess Power (%)',
                angle: -90,
                position: 'insideLeft',
                offset: 10,
                style: { fontSize: 12, fontWeight: 600, fill: '#6b7280' },
              }}
              domain={[0, 'auto']}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              formatter={value => (
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
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
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: `Good (${data.thresholds.good}%)`,
                    position: 'right',
                    fill: '#10b981',
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={data.thresholds.poor}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: `Poor (${data.thresholds.poor}%)`,
                    position: 'right',
                    fill: '#ef4444',
                    fontSize: 10,
                  }}
                />
              </>
            )}

            {/* Scatter points */}
            <Scatter
              name="Actual Excess Power"
              data={data.dataPoints}
              fill="#3b82f6"
              fillOpacity={0.6}
              dataKey="excessPowerPct"
            />

            {/* Trend line */}
            {showTrendLine && trendLineData.length > 0 && (
              <Line
                name="Trend Line"
                data={trendLineData}
                dataKey="predicted"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                type="monotone"
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics Summary */}
      <div className="grid grid-cols-4 gap-2 px-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Mean</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.mean.toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Std Dev</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.stdDev.toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Min</p>
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
            {data.statistics.min.toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Max</p>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            {data.statistics.max.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}
