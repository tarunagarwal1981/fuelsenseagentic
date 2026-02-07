'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CostItem {
  port_name?: string;
  port_code?: string;
  fuel_cost_usd?: number;
  total_cost_usd?: number;
  deviation_cost_usd?: number;
  rank?: number;
}

interface CostComparisonProps {
  data: {
    ports?: CostItem[];
    recommendations?: CostItem[];
    best_option?: CostItem;
  };
  className?: string;
}

export function CostComparison({ data, className }: CostComparisonProps) {
  const items = data.ports ?? data.recommendations ?? [];
  const best = data.best_option ?? items[0];
  const fmt = (n: number) => n?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '-';

  if (items.length === 0 && !best) return null;

  return (
    <div className={cn('my-4 rounded-lg border bg-card p-4', className)}>
      {best && (
        <div className="mb-4 p-3 bg-primary/5 rounded-lg">
          <div className="text-sm font-medium text-muted-foreground">Recommended Port</div>
          <div className="text-xl font-bold">
            {best.port_name ?? best.port_code}
            {best.total_cost_usd != null && (
              <span className="ml-2 text-lg font-normal text-muted-foreground">
                ${fmt(best.total_cost_usd)}
              </span>
            )}
          </div>
        </div>
      )}
      {items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Port</TableHead>
              <TableHead className="text-right">Fuel Cost</TableHead>
              <TableHead className="text-right">Deviation</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 10).map((item, i) => (
              <TableRow key={i}>
                <TableCell>{item.rank ?? i + 1}</TableCell>
                <TableCell className="font-medium">
                  {item.port_name ?? item.port_code}
                </TableCell>
                <TableCell className="text-right">
                  ${fmt(item.fuel_cost_usd ?? 0)}
                </TableCell>
                <TableCell className="text-right">
                  ${fmt(item.deviation_cost_usd ?? 0)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ${fmt(item.total_cost_usd ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
