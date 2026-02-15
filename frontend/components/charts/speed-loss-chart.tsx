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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border-2 border-purple-200 dark:border-purple-700 rounded-xl shadow-2xl p-4 min-w-[200px]">
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Speed Loss
            </span>
          </div>
          <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
            {data.speedLossPct?.toFixed(2)}%
          </span>
        </div>

        {data.actualSpeed != null && (
          <div className="flex items-center justify-between gap-6 pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Actual Speed
            </span>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {data.actualSpeed.toFixed(1)} knots
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props;

  let fill = '#8b5cf6'; // purple-500
  if (payload.speedLossPct >= 15) {
    fill = '#ef4444'; // red-500
  } else if (payload.speedLossPct >= 8) {
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

export function SpeedLossChart({
  data,
  height = 450,
  showTrendLine = true,
  className = '',
}: SpeedLossChartProps) {
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
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
        <p className="text-sm font-medium">
          Insufficient data for speed loss trend analysis
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Need at least 2 non-zero data points
        </p>
      </div>
    );
  }

  const trendLineData =
    showTrendLine && data.regression
      ? data.dataPoints.map((point) => ({
          timestamp: point.timestamp,
          predicted:
            data.regression!.slope * point.timestamp + data.regression!.intercept,
        }))
      : [];

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
      <div className="flex items-start justify-between px-4">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
            Hull Roughness Speed Loss Trend
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

      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 20, right: 40, bottom: 70, left: 70 }}>
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
                  value: 'Speed Loss (%)',
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

              <Scatter
                name="Actual Speed Loss"
                data={data.dataPoints}
                dataKey="speedLossPct"
                shape={<CustomDot />}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />

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

      <div className="grid grid-cols-4 gap-3 px-4">
        <div className="text-center p-3 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg border border-purple-200 dark:border-purple-800">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
            Mean
          </p>
          <p className="text-xl font-bold text-purple-900 dark:text-purple-100 mt-1">
            {data.statistics.mean.toFixed(1)}%
          </p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
            Std Dev
          </p>
          <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
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
