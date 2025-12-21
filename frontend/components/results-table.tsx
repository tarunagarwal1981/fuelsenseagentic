// components/results-table.tsx
'use client';

import { useState } from 'react';
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, ChevronDown, ChevronUp, Trophy, Medal, Award } from 'lucide-react';

interface BunkerRecommendation {
  port_code: string;
  port_name: string;
  rank: number;
  fuel_price_per_mt: number;
  fuel_cost: number;
  deviation_nm: number;
  deviation_hours: number;
  deviation_days: number;
  deviation_fuel_consumption_mt: number;
  deviation_fuel_cost: number;
  total_cost: number;
  savings_vs_most_expensive: number;
  savings_percentage: number;
  data_freshness_hours: number;
  is_price_stale: boolean;
}

interface ResultsTableProps {
  recommendations: BunkerRecommendation[];
  fuelQuantity: number;
  fuelType: string;
}

type SortField = 'rank' | 'port_name' | 'fuel_price_per_mt' | 'deviation_nm' | 'total_cost' | 'savings_vs_most_expensive';
type SortDirection = 'asc' | 'desc';

export function ResultsTable({ recommendations, fuelQuantity, fuelType }: ResultsTableProps) {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Sort function
  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return sortDirection === 'asc' 
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Rank',
      'Port',
      'Port Code',
      'Fuel Price ($/MT)',
      'Fuel Cost ($)',
      'Deviation (nm)',
      'Deviation Cost ($)',
      'Total Cost ($)',
      'Savings ($)',
      'Savings %',
    ];

    const rows = sortedRecommendations.map(rec => [
      rec.rank,
      rec.port_name,
      rec.port_code,
      rec.fuel_price_per_mt,
      rec.fuel_cost.toFixed(2),
      rec.deviation_nm.toFixed(1),
      rec.deviation_fuel_cost.toFixed(2),
      rec.total_cost.toFixed(2),
      rec.savings_vs_most_expensive.toFixed(2),
      rec.savings_percentage.toFixed(1),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bunker-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground">#{rank}</span>;
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-2">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Bunker Port Analysis</CardTitle>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="rank">Rank</SortableHeader>
                <SortableHeader field="port_name">Port</SortableHeader>
                <SortableHeader field="fuel_price_per_mt">Price ($/MT)</SortableHeader>
                <SortableHeader field="deviation_nm">Deviation (nm)</SortableHeader>
                <SortableHeader field="total_cost">Total Cost</SortableHeader>
                <SortableHeader field="savings_vs_most_expensive">Savings</SortableHeader>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecommendations.map((rec) => (
                <React.Fragment key={rec.port_code}>
                  <TableRow
                    className={`
                      ${rec.rank === 1 ? 'bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900' : ''}
                      ${expandedRow === rec.port_code ? 'border-b-0' : ''}
                    `}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getRankIcon(rec.rank)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{rec.port_name}</div>
                        <div className="text-xs text-muted-foreground">{rec.port_code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        ${rec.fuel_price_per_mt.toLocaleString()}
                        {rec.is_price_stale && (
                          <Badge variant="outline" className="text-xs">
                            Stale
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{rec.deviation_nm.toFixed(1)} nm</div>
                        <div className="text-xs text-muted-foreground">
                          {rec.deviation_hours.toFixed(1)}h
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      ${rec.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      {rec.rank === 1 ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Best Option
                        </Badge>
                      ) : (
                        <div>
                          <div className="text-red-600 font-medium">
                            +${rec.savings_vs_most_expensive.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ({rec.savings_percentage.toFixed(1)}% more)
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRow(expandedRow === rec.port_code ? null : rec.port_code)}
                      >
                        {expandedRow === rec.port_code ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Details Row */}
                  {expandedRow === rec.port_code && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/50">
                        <div className="p-4 space-y-3">
                          <h4 className="font-semibold text-sm">Cost Breakdown</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Fuel Cost</p>
                              <p className="font-semibold">
                                ${rec.fuel_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {fuelQuantity} MT × ${rec.fuel_price_per_mt}/MT
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Deviation Cost</p>
                              <p className="font-semibold">
                                ${rec.deviation_fuel_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rec.deviation_fuel_consumption_mt.toFixed(1)} MT consumed
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Time Impact</p>
                              <p className="font-semibold">
                                {rec.deviation_hours.toFixed(1)} hours
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rec.deviation_days.toFixed(2)} days
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Data Age</p>
                              <p className="font-semibold">
                                {rec.data_freshness_hours.toFixed(1)}h old
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rec.is_price_stale ? 'Outdated' : 'Fresh'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Ports Analyzed</p>
              <p className="text-2xl font-bold">{recommendations.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Best Price</p>
              <p className="text-2xl font-bold text-green-600">
                ${sortedRecommendations[0]?.fuel_price_per_mt || 0}/MT
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Savings</p>
              <p className="text-2xl font-bold text-green-600">
                ${(sortedRecommendations[0]?.savings_vs_most_expensive || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fuel Type</p>
              <p className="text-2xl font-bold">{fuelType}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

