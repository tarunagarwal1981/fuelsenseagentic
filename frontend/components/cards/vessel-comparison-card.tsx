'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertTriangle, XCircle, Trophy, Ship } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/** Vessel analysis from state (vessels_analyzed item) */
interface VesselAnalyzedItem {
  vessel_name: string;
  projected_rob?: { VLSFO: number; LSMGO: number };
  bunker_plan?: {
    port_name: string;
    total_cost_usd?: number;
    bunker_quantity?: { VLSFO?: number; LSMGO?: number };
    deviation_nm?: number;
  };
  total_cost_usd: number;
  feasibility?: 'feasible' | 'marginal' | 'infeasible';
  planning_data?: {
    vessel_name: string;
    projected_rob_at_start?: { VLSFO: number; LSMGO: number };
    vessel_profile?: { initial_rob?: { VLSFO: number; LSMGO: number } };
    next_voyage_requirements?: { VLSFO: number; LSMGO: number };
    can_proceed_without_bunker?: boolean;
    bunker_plan?: VesselAnalyzedItem['bunker_plan'];
    total_voyage_cost: number;
    cost_breakdown?: {
      base_fuel_cost?: number;
      bunker_fuel_cost?: number;
      bunker_port_fees?: number;
      deviation_cost?: number;
      time_cost?: number;
      total_cost?: number;
    };
    feasibility_score?: number;
    risks?: string[];
  };
}

/** Ranking from state */
interface VesselRankingItem {
  rank: number;
  vessel_name: string;
  score?: number;
  recommendation_reason?: string;
  total_cost_usd?: number;
  feasibility?: 'feasible' | 'marginal' | 'infeasible';
}

/** Comparison matrix row (vessel -> metrics) */
interface ComparisonMatrixRow {
  [key: string]: unknown;
}

export interface VesselComparisonCardProps {
  /** Vessel comparison analysis from state */
  data: {
    vessels_analyzed?: VesselAnalyzedItem[];
    rankings?: VesselRankingItem[];
    recommended_vessel?: string;
    analysis_summary?: string;
    comparison_matrix?: Record<string, ComparisonMatrixRow>;
  };
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string | null;
  /** Optional class name */
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatROB(rob: { VLSFO?: number; LSMGO?: number } | undefined): string {
  if (!rob) return '—';
  const v = rob.VLSFO ?? 0;
  const l = rob.LSMGO ?? 0;
  return `${v.toFixed(0)} / ${l.toFixed(0)} MT`;
}

function formatCost(usd: number | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function getFeasibilityConfig(
  feasibility: 'feasible' | 'marginal' | 'infeasible' | string | undefined,
  canProceed?: boolean
): { icon: typeof CheckCircle; label: string; className: string } {
  if (canProceed === true) {
    return {
      icon: CheckCircle,
      label: 'Sufficient ROB',
      className: 'text-green-600',
    };
  }
  switch (feasibility) {
    case 'feasible':
      return {
        icon: CheckCircle,
        label: 'Feasible',
        className: 'text-green-600',
      };
    case 'marginal':
      return {
        icon: AlertTriangle,
        label: 'Needs bunker',
        className: 'text-amber-600',
      };
    case 'infeasible':
      return {
        icon: XCircle,
        label: 'Infeasible',
        className: 'text-red-600',
      };
    default:
      return {
        icon: AlertTriangle,
        label: 'Needs bunker',
        className: 'text-amber-600',
      };
  }
}

// ============================================================================
// Component
// ============================================================================

export function VesselComparisonCard({
  data,
  isLoading = false,
  error = null,
  className,
}: VesselComparisonCardProps): React.ReactElement {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    validateData(data);
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Vessel comparison failed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const vessels = data.vessels_analyzed ?? [];
  const rankings = data.rankings ?? [];
  const recommended = data.recommended_vessel ?? rankings[0]?.vessel_name;
  const matrix = data.comparison_matrix ?? {};

  if (vessels.length === 0 && Object.keys(matrix).length === 0) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No vessel data</AlertTitle>
        <AlertDescription>
          No vessel comparison data is available.
        </AlertDescription>
      </Alert>
    );
  }

  // Build display rows from vessels_analyzed or comparison_matrix
  const vesselNames =
    vessels.length > 0
      ? vessels.map((v) => v.vessel_name)
      : Object.keys(matrix);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Ship className="h-5 w-5 text-muted-foreground" aria-hidden />
          <CardTitle>Vessel Comparison</CardTitle>
        </div>
        {data.analysis_summary && (
          <CardDescription>{data.analysis_summary}</CardDescription>
        )}
        {recommended && (
          <div
            className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 border border-green-200 dark:border-green-800"
            role="status"
            aria-label={`Recommended vessel: ${recommended}`}
          >
            <Trophy className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
            <span className="font-semibold text-green-800 dark:text-green-200">
              Recommended: {recommended}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Rankings with reasons */}
        {rankings.length > 0 && (
          <section aria-labelledby="vessel-rankings-heading">
            <h2
              id="vessel-rankings-heading"
              className="text-sm font-semibold text-muted-foreground mb-3"
            >
              Rankings
            </h2>
            <ol className="space-y-2">
              {rankings.map((r) => (
                <li
                  key={r.vessel_name}
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-3 border',
                    r.vessel_name === recommended
                      ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800'
                      : 'border-border bg-muted/30'
                  )}
                >
                  <Badge variant="outline" className="shrink-0">
                    #{r.rank}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.vessel_name}</p>
                    {r.recommendation_reason && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.recommendation_reason}
                      </p>
                    )}
                  </div>
                  {r.total_cost_usd != null && (
                    <span className="text-sm font-medium shrink-0">
                      {formatCost(r.total_cost_usd)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Comparison matrix table */}
        <section aria-labelledby="comparison-matrix-heading">
          <h2
            id="comparison-matrix-heading"
            className="text-sm font-semibold text-muted-foreground mb-3"
          >
            Comparison Matrix
          </h2>
          <ScrollArea className="w-full">
            <Table>
              <TableCaption>Per-vessel metrics for voyage planning</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Metric</TableHead>
                  {vesselNames.map((name) => (
                    <TableHead
                      key={name}
                      className={cn(
                        'min-w-[120px] text-center',
                        name === recommended && 'bg-green-50/50 dark:bg-green-950/20'
                      )}
                    >
                      <span className="font-semibold">
                        {name}
                        {name === recommended && (
                          <Trophy
                            className="inline-block ml-1 h-3.5 w-3.5 text-green-600"
                            aria-label="recommended"
                          />
                        )}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Current ROB */}
                <TableRow>
                  <TableCell className="font-medium">Current ROB (VLSFO / LSMGO)</TableCell>
                  {vesselNames.map((name) => {
                    const v = vessels.find((x) => x.vessel_name === name);
                    const rob = v?.planning_data?.vessel_profile?.initial_rob;
                    return (
                      <TableCell key={name} className="text-center">
                        {formatROB(rob)}
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Projected ROB at voyage start */}
                <TableRow>
                  <TableCell className="font-medium">Projected ROB at voyage start (VLSFO / LSMGO)</TableCell>
                  {vesselNames.map((name) => {
                    const v = vessels.find((x) => x.vessel_name === name);
                    const m = matrix[name] as Record<string, unknown> | undefined;
                    const rob =
                      v?.planning_data?.projected_rob_at_start ??
                      v?.projected_rob ??
                      (m && 'projected_rob_vlsfo' in m
                        ? {
                            VLSFO: m.projected_rob_vlsfo as number,
                            LSMGO: m.projected_rob_lsmgo as number,
                          }
                        : undefined);
                    return (
                      <TableCell key={name} className="text-center">
                        {formatROB(rob)}
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Bunker requirement */}
                <TableRow>
                  <TableCell className="font-medium">Bunker requirement</TableCell>
                  {vesselNames.map((name) => {
                    const v = vessels.find((x) => x.vessel_name === name);
                    const m = matrix[name] as Record<string, unknown> | undefined;
                    const canProceed =
                      v?.planning_data?.can_proceed_without_bunker ??
                      (m?.can_proceed_without_bunker as boolean | undefined);
                    const bunkerPort =
                      v?.bunker_plan?.port_name ??
                      (m?.bunker_port as string | undefined);
                    const score = m?.feasibility_score as number | undefined;
                    const feasibilityFromScore =
                      score != null
                        ? score >= 80
                          ? 'feasible'
                          : score >= 50
                            ? 'marginal'
                            : 'infeasible'
                        : undefined;
                    const config = getFeasibilityConfig(
                      v?.feasibility ?? feasibilityFromScore,
                      canProceed
                    );
                    const Icon = config.icon;
                    return (
                      <TableCell key={name} className="text-center">
                        <span className="flex items-center justify-center gap-1.5">
                          <Icon
                            className={cn('h-4 w-4', config.className)}
                            aria-hidden
                          />
                          {canProceed ? (
                            <span className="text-green-600">—</span>
                          ) : bunkerPort ? (
                            <span>{bunkerPort}</span>
                          ) : (
                            <span className="text-amber-600">Required</span>
                          )}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Total voyage cost */}
                <TableRow>
                  <TableCell className="font-medium">Total voyage cost</TableCell>
                  {vesselNames.map((name) => {
                    const v = vessels.find((x) => x.vessel_name === name);
                    const m = matrix[name] as Record<string, unknown> | undefined;
                    const cost =
                      v?.total_cost_usd ??
                      v?.planning_data?.total_voyage_cost ??
                      (m?.total_voyage_cost as number | undefined);
                    return (
                      <TableCell key={name} className="text-center font-medium">
                        {formatCost(cost)}
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Feasibility score */}
                <TableRow>
                  <TableCell className="font-medium">Feasibility</TableCell>
                  {vesselNames.map((name) => {
                    const v = vessels.find((x) => x.vessel_name === name);
                    const m = matrix[name] as Record<string, unknown> | undefined;
                    const score =
                      v?.planning_data?.feasibility_score ??
                      (m?.feasibility_score as number | undefined);
                    const canProceed =
                      v?.planning_data?.can_proceed_without_bunker ??
                      (m?.can_proceed_without_bunker as boolean | undefined);
                    const feasibility = v?.feasibility;
                    const config = getFeasibilityConfig(
                      feasibility ??
                        (score != null
                          ? score >= 80
                            ? 'feasible'
                            : score >= 50
                              ? 'marginal'
                              : 'infeasible'
                          : undefined),
                      canProceed
                    );
                    const Icon = config.icon;
                    return (
                      <TableCell key={name} className="text-center">
                        <span className="flex items-center justify-center gap-1.5">
                          <Icon
                            className={cn('h-4 w-4', config.className)}
                            aria-hidden
                          />
                          {score != null ? `${score}` : config.label}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>

        {/* Cost breakdown for first vessel with planning_data */}
        {vessels.some((v) => v.planning_data?.cost_breakdown) && (
          <section aria-labelledby="cost-breakdown-heading">
            <h2
              id="cost-breakdown-heading"
              className="text-sm font-semibold text-muted-foreground mb-3"
            >
              Cost breakdown
            </h2>
            <div className="space-y-3">
              {vessels
                .filter((v) => v.planning_data?.cost_breakdown)
                .slice(0, 3)
                .map((v) => {
                  const cb = v.planning_data!.cost_breakdown!;
                  const items = [
                    cb.base_fuel_cost != null && ['Base fuel', cb.base_fuel_cost],
                    cb.bunker_fuel_cost != null && ['Bunker fuel', cb.bunker_fuel_cost],
                    cb.bunker_port_fees != null && ['Port fees', cb.bunker_port_fees],
                    cb.deviation_cost != null && ['Deviation', cb.deviation_cost],
                    cb.time_cost != null && ['Time cost', cb.time_cost],
                  ].filter(Boolean) as [string, number][];
                  if (items.length === 0) return null;
                  return (
                    <div
                      key={v.vessel_name}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <p className="font-medium text-sm">{v.vessel_name}</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {items.map(([label, val]) => (
                          <React.Fragment key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium">{formatCost(val)}</dd>
                          </React.Fragment>
                        ))}
                        <dt className="text-muted-foreground font-medium">Total</dt>
                        <dd className="font-semibold">
                          {formatCost(cb.total_cost ?? v.total_cost_usd)}
                        </dd>
                      </dl>
                    </div>
                  );
                })}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

VesselComparisonCard.displayName = 'VesselComparisonCard';

/** Runtime validation for data prop (development only) */
function validateData(data: unknown): void {
  if (data == null || typeof data !== 'object') {
    console.warn('[VesselComparisonCard] Invalid data: expected object');
    return;
  }
  const d = data as Record<string, unknown>;
  if (d.vessels_analyzed != null && !Array.isArray(d.vessels_analyzed)) {
    console.warn('[VesselComparisonCard] vessels_analyzed should be an array');
  }
  if (d.rankings != null && !Array.isArray(d.rankings)) {
    console.warn('[VesselComparisonCard] rankings should be an array');
  }
  if (d.comparison_matrix != null && typeof d.comparison_matrix !== 'object') {
    console.warn('[VesselComparisonCard] comparison_matrix should be an object');
  }
}
