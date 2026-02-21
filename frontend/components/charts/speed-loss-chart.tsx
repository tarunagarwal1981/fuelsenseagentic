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
import { CHART } from '@/lib/chart-theme';

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
  const x = vb.x + 6;
  const y = vb.y + vb.height / 2;
  return (
    <text x={x} y={y} textAnchor="middle" fill={fill} fontSize={11} fontWeight={600} transform={`rotate(-90, ${x}, ${y})`}>
      {value}
    </text>
  );
}

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
    <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 min-w-[160px]">
      <div className="border-b border-border pb-2 mb-3">
        <p className="text-xs font-poppins font-semibold text-foreground uppercase tracking-wide">
          Date
        </p>
        <p className="text-sm font-sans text-foreground mt-0.5">
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
            <div className="w-3 h-3 rounded-full bg-teal-500"></div>
            <span className="text-xs font-sans text-muted-foreground">
              Speed Loss
            </span>
          </div>
          <span className="text-sm font-sans font-semibold text-foreground">
            {data.speedLossPct?.toFixed(2)}%
          </span>
        </div>

        {data.actualSpeed != null && (
          <div className="flex items-center justify-between gap-6 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Actual Speed
            </span>
            <span className="text-sm font-semibold text-foreground">
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

  let fill: string = CHART.primary;
  if (payload.speedLossPct >= 15) {
    fill = CHART.zoneError;
  } else if (payload.speedLossPct >= 8) {
    fill = CHART.zoneWarning;
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
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 10, right: 12, bottom: 32, left: 44 }}>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke={CHART.grid}
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
                  style: { fontSize: 12, fontWeight: 600, fill: CHART.axisLabel },
                }}
                tick={{ fontSize: 12, fill: CHART.axisLabel }}
                stroke={CHART.axisLabel}
                strokeWidth={1.5}
              />

              <YAxis
                label={{ value: 'Speed Loss (%)', content: ((props: unknown) => <YAxisLabel {...(props as React.ComponentProps<typeof YAxisLabel>)} fill={CHART.axisLabel} />) as unknown as React.ReactElement }}
                domain={[0, 'auto']}
                tick={{ fontSize: 12, fill: CHART.axisLabel }}
                stroke={CHART.axisLabel}
                strokeWidth={1.5}
                width={32}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '5 5', stroke: CHART.axisLabel }}
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
                  stroke={CHART.referenceError}
                  strokeWidth={3}
                  dot={false}
                  type="monotone"
                  strokeDasharray="6 3"
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
