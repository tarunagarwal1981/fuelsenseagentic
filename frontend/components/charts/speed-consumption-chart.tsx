'use client';

import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SpeedConsumptionChartData } from '@/lib/services/charts/speed-consumption-chart-service';

interface SpeedConsumptionChartProps {
  data: SpeedConsumptionChartData | null;
  height?: number;
  colorByDate?: boolean;
  className?: string;
}

interface TooltipPayloadItem {
  payload?: {
    timestamp?: number;
    speed?: number;
    consumption?: number;
    condition?: 'laden' | 'ballast';
  };
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
        <span className="text-gray-600 dark:text-gray-400">Speed:</span>
        <span className="font-semibold text-teal-600 dark:text-teal-400">
          {data.speed?.toFixed(1)} kts
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs mt-1">
        <span className="text-gray-600 dark:text-gray-400">Consumption:</span>
        <span className="font-semibold text-teal-600 dark:text-teal-400">
          {data.consumption?.toFixed(2)} MT/day
        </span>
      </div>
      {data.condition && (
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Condition: {data.condition === 'laden' ? 'Laden' : 'Ballast'}
          </span>
        </div>
      )}
    </div>
  );
}

export function SpeedConsumptionChart({
  data,
  height = 400,
  className = '',
  // colorByDate reserved for future date-based coloring
}: SpeedConsumptionChartProps) {
  if (!data || !data.dataPoints || data.dataPoints.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
        style={{ height }}
      >
        <p className="text-sm">Insufficient data for speed-consumption analysis</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between px-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Speed vs Fuel Consumption
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Correlation: {data.statistics.correlation >= 0 ? '+' : ''}
            {data.statistics.correlation.toFixed(3)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {data.dataPoints.length} points
          </span>
        </div>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />

            <XAxis
              dataKey="speed"
              type="number"
              domain={['dataMin - 0.5', 'dataMax + 0.5']}
              label={{
                value: 'Vessel Speed (knots)',
                position: 'insideBottom',
                offset: -15,
                style: { fontSize: 12, fontWeight: 600, fill: '#6b7280' },
              }}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />

            <YAxis
              dataKey="consumption"
              label={{
                value: 'Fuel Consumption (MT/day)',
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
              name="Fuel Consumption"
              data={data.dataPoints}
              fill="#14b8a6"
              fillOpacity={0.6}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-4 gap-2 px-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Speed</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.avgSpeed.toFixed(1)} kts
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Consumption</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.avgConsumption.toFixed(1)} MT/d
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Speed Range</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.speedRange.min.toFixed(1)} - {data.statistics.speedRange.max.toFixed(1)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Consumption Range</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {data.statistics.consumptionRange.min.toFixed(1)} - {data.statistics.consumptionRange.max.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}
