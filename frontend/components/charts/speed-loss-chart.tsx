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
} from 'recharts';
import type { SpeedLossChartData } from '@/lib/services/charts/speed-loss-chart-service';

interface SpeedLossChartProps {
  data: SpeedLossChartData | null;
  height?: number;
  showTrendLine?: boolean;
  className?: string;
}

interface TooltipPayloadItem {
  payload?: { timestamp?: number; speedLossPct?: number; actualSpeed?: number };
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
        <span className="text-gray-600 dark:text-gray-400">Speed Loss:</span>
        <span className="font-semibold text-purple-600 dark:text-purple-400">
          {data.speedLossPct?.toFixed(2)}%
        </span>
      </div>
      {data.actualSpeed != null && (
        <div className="flex items-center justify-between gap-4 text-xs mt-1">
          <span className="text-gray-600 dark:text-gray-400">Actual Speed:</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {data.actualSpeed.toFixed(1)} kts
          </span>
        </div>
      )}
    </div>
  );
}

export function SpeedLossChart({
  data,
  height = 400,
  showTrendLine = true,
  className = '',
}: SpeedLossChartProps) {
  if (!data || !data.dataPoints || data.dataPoints.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
        style={{ height }}
      >
        <p className="text-sm">Insufficient data for speed loss trend analysis</p>
      </div>
    );
  }

  const trendLineData =
    showTrendLine && data.regression
      ? data.dataPoints.map(point => ({
          timestamp: point.timestamp,
          predicted: data.regression.slope * point.timestamp + data.regression.intercept,
        }))
      : [];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between px-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Hull Roughness Speed Loss Trend
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
                value: 'Speed Loss (%)',
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

            <Scatter
              name="Actual Speed Loss"
              data={data.dataPoints}
              fill="#8b5cf6"
              fillOpacity={0.6}
              dataKey="speedLossPct"
            />

            {showTrendLine && trendLineData.length > 0 && (
              <Line
                name="Trend Line"
                data={trendLineData}
                dataKey="predicted"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                type="monotone"
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

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
