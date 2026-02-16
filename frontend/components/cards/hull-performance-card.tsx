'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Anchor, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { HullPerformanceAnalysis, HullPerformanceChartData } from '@/lib/services/hull-performance-service';
import { ExcessPowerChart } from '@/components/charts/excess-power-chart';
import { SpeedLossChart } from '@/components/charts/speed-loss-chart';
import { SpeedConsumptionChart } from '@/components/charts/speed-consumption-chart';

// ============================================================================
// Props Interface
// ============================================================================

interface HullPerformanceCardProps {
  analysis: HullPerformanceAnalysis;
  chartData?: HullPerformanceChartData;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getConditionVariant(condition: 'GOOD' | 'AVERAGE' | 'POOR'): 'default' | 'secondary' | 'destructive' {
  switch (condition) {
    case 'GOOD':
      return 'default';
    case 'AVERAGE':
      return 'secondary';
    case 'POOR':
      return 'destructive';
  }
}

function getTrend(
  trendData: HullPerformanceAnalysis['trend_data'] | undefined,
  field: string
): 'up' | 'down' | 'stable' {
  if (!trendData || trendData.length < 2) return 'stable';

  const recent = trendData.slice(-5);
  const values = recent
    .map(d => (d as Record<string, unknown>)[field])
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

  if (values.length < 2) return 'stable';

  const first = values[0];
  const last = values[values.length - 1];
  const change = ((last - first) / first) * 100;

  if (Math.abs(change) < 2) return 'stable';
  return change > 0 ? 'up' : 'down';
}

// ============================================================================
// Metric Card Component
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
}

function MetricCard({ label, value, trend }: MetricCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-gray-400';

  return (
    <div className="flex flex-col space-y-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <TrendIcon className={`h-4 w-4 ${trendColor}`} />
      </div>
      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function HullPerformanceCard({ analysis, chartData }: HullPerformanceCardProps) {
  const ConditionIcon = analysis.hull_condition === 'GOOD' ? CheckCircle2 :
                        analysis.hull_condition === 'AVERAGE' ? AlertTriangle :
                        AlertTriangle;

  const hasChartData = chartData && (
    chartData.excessPower !== null ||
    chartData.speedLoss !== null ||
    chartData.speedConsumption !== null
  );

  return (
    <Card className="w-full shadow-lg">
      {/* ================================================================ */}
      {/* Summary Header */}
      {/* ================================================================ */}
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Anchor className="h-5 w-5 text-blue-600" />
              Hull Performance Analysis
            </CardTitle>
            <CardDescription className="text-sm">
              {analysis.vessel.name} • IMO {analysis.vessel.imo}
            </CardDescription>
          </div>

          <Badge
            variant={getConditionVariant(analysis.hull_condition)}
            className="flex items-center gap-1.5 px-3 py-1"
          >
            <ConditionIcon className="h-3.5 w-3.5" />
            {analysis.condition_indicator} {analysis.hull_condition}
          </Badge>
        </div>

        {/* Condition Message */}
        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            {analysis.condition_message}
          </p>
        </div>

        {/* Quick Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <MetricCard
            label="Excess Power"
            value={`${analysis.latest_metrics.excess_power_pct.toFixed(1)}%`}
            trend={getTrend(analysis.trend_data, 'excess_power_pct')}
          />
          <MetricCard
            label="Speed Loss"
            value={`${analysis.latest_metrics.speed_loss_pct.toFixed(1)}%`}
            trend={getTrend(analysis.trend_data, 'speed_loss_pct')}
          />
          <MetricCard
            label="Excess Fuel"
            value={`${analysis.latest_metrics.excess_fuel_consumption_mtd.toFixed(1)} MT/day`}
            trend={getTrend(analysis.trend_data, 'excess_fuel_mtd')}
          />
        </div>

        {/* Analysis Period Info */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Analysis Period:</span>
          <span className="font-medium">
            {analysis.analysis_period.start_date} to {analysis.analysis_period.end_date}
          </span>
          <span>•</span>
          <span>{analysis.analysis_period.total_records} data points</span>
        </div>
      </CardHeader>

      {/* ================================================================ */}
      {/* Tabbed Charts Section */}
      {/* ================================================================ */}
      <CardContent className="pt-0">
        {hasChartData ? (
          <Tabs defaultValue="power" className="w-full">
            <TabsList className="tabs-figma-68088 grid w-full grid-cols-3 mb-4 bg-transparent p-0 h-auto rounded-none border-0 border-b border-[var(--figma-Surface-Card-stroke)]">
              <TabsTrigger
                value="power"
                className="text-xs md:text-sm rounded-md px-4 py-2.5 data-[state=active]:bg-[var(--figma-Primary-Teal)] data-[state=active]:text-[var(--figma-Grey-01)] data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent text-[var(--figma-Text-Title)] hover:bg-[var(--figma-Grey-03)] border-0"
              >
                Power Loss
              </TabsTrigger>
              <TabsTrigger
                value="speed"
                className="text-xs md:text-sm rounded-md px-4 py-2.5 data-[state=active]:bg-[var(--figma-Primary-Teal)] data-[state=active]:text-[var(--figma-Grey-01)] data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent text-[var(--figma-Text-Title)] hover:bg-[var(--figma-Grey-03)] border-0"
              >
                Speed Loss
              </TabsTrigger>
              <TabsTrigger
                value="consumption"
                className="text-xs md:text-sm rounded-md px-4 py-2.5 data-[state=active]:bg-[var(--figma-Primary-Teal)] data-[state=active]:text-[var(--figma-Grey-01)] data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent text-[var(--figma-Text-Title)] hover:bg-[var(--figma-Grey-03)] border-0"
              >
                Speed-Consumption
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Excess Power */}
            <TabsContent value="power" className="mt-0">
              {chartData?.excessPower ? (
                <ExcessPowerChart
                  data={chartData.excessPower}
                  height={400}
                  showThresholds={true}
                  showTrendLine={true}
                />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Excess power data unavailable</p>
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Speed Loss */}
            <TabsContent value="speed" className="mt-0">
              {chartData?.speedLoss ? (
                <SpeedLossChart
                  data={chartData.speedLoss}
                  height={400}
                  showTrendLine={true}
                />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Speed loss data unavailable</p>
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Speed-Consumption */}
            <TabsContent value="consumption" className="mt-0">
              {chartData?.speedConsumption ? (
                <SpeedConsumptionChart
                  data={chartData.speedConsumption}
                  height={400}
                />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Speed-consumption data unavailable</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-sm">Chart data unavailable. Showing summary metrics only.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
