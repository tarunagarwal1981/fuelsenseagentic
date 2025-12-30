'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Star,
  Fuel,
  MapPin,
  Cloud,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BunkerTableData } from '@/lib/formatters/response-formatter';

type SortField = 'portName' | 'totalCostUSD' | 'deviationNM' | 'confidenceScore' | 'averagePricePerMT';
type SortDirection = 'asc' | 'desc';

export function EnhancedBunkerTable({ data }: { data: BunkerTableData | null }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('totalCostUSD');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  if (!data) {
    return null;
  }

  const allPorts = [
    ...(data.recommendedPort ? [data.recommendedPort] : []),
    ...data.alternativePorts
  ];

  // Sort function
  const sortedPorts = [...allPorts].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'portName':
        aValue = a.portName;
        bValue = b.portName;
        break;
      case 'totalCostUSD':
        aValue = a.totalCostUSD;
        bValue = b.totalCostUSD;
        break;
      case 'deviationNM':
        aValue = a.deviationNM;
        bValue = b.deviationNM;
        break;
      case 'confidenceScore':
        aValue = a.confidenceScore;
        bValue = b.confidenceScore;
        break;
      case 'averagePricePerMT':
        aValue = a.averagePricePerMT;
        bValue = b.averagePricePerMT;
        break;
      default:
        return 0;
    }

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

  const toggleRow = (portCode: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(portCode)) {
      newExpanded.delete(portCode);
    } else {
      newExpanded.add(portCode);
    }
    setExpandedRows(newExpanded);
  };

  const SortableHeader = ({ field, children, align = 'left' }: { field: SortField; children: React.ReactNode; align?: 'left' | 'right' | 'center' }) => (
    <TableHead 
      className={`cursor-pointer hover:bg-muted/50 select-none ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </TableHead>
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Bunker Port Options</h3>
        <p className="text-sm text-muted-foreground">
          {allPorts.length} port{allPorts.length !== 1 ? 's' : ''} analyzed
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Port</TableHead>
              <TableHead>Fuel Breakdown</TableHead>
              <SortableHeader field="totalCostUSD" align="right">Total Cost</SortableHeader>
              <SortableHeader field="deviationNM" align="right">Deviation</SortableHeader>
              <TableHead className="text-center">Weather</TableHead>
              <SortableHeader field="confidenceScore" align="center">Confidence</SortableHeader>
              <TableHead className="text-center">Savings</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPorts.map((port) => {
              const isExpanded = expandedRows.has(port.portCode);
              const hasFuelBreakdown = port.fuelBreakdown.length > 1;
              
              return (
                <React.Fragment key={port.portCode}>
                  <TableRow 
                    className={port.isRecommended ? 'bg-green-50/50 border-green-200' : ''}
                  >
                    {/* Port Name */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {port.isRecommended && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                        <div>
                          <div className="font-medium">{port.portName}</div>
                          <div className="text-xs text-muted-foreground">{port.portCode}</div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Fuel Breakdown Summary */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {port.fuelBreakdown.map((fuel, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {fuel.quantityMT.toFixed(0)} MT {fuel.type}
                          </Badge>
                        ))}
                      </div>
                      {port.fuelBreakdown.length === 0 && (
                        <span className="text-xs text-muted-foreground">No breakdown</span>
                      )}
                    </TableCell>

                    {/* Total Cost */}
                    <TableCell className="text-right">
                      <div className="font-semibold">
                        ${port.totalCostUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${port.averagePricePerMT.toFixed(0)}/MT avg
                      </div>
                    </TableCell>

                    {/* Deviation */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{port.deviationNM.toFixed(1)} nm</span>
                      </div>
                    </TableCell>

                    {/* Weather Safety */}
                    <TableCell className="text-center">
                      <Badge 
                        variant={port.weatherSafe ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {port.weatherStatus}
                      </Badge>
                    </TableCell>

                    {/* Confidence */}
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2">
                        <div className="w-full max-w-[60px] h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500"
                            style={{ width: `${port.confidencePercentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">
                          {port.confidencePercentage}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Savings */}
                    <TableCell className="text-center">
                      {port.savingsVsNextBest !== undefined && port.savingsVsNextBest > 0 && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          ${port.savingsVsNextBest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Expand Button */}
                    <TableCell>
                      {hasFuelBreakdown && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(port.portCode)}
                          className="h-8 w-8 p-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded Row - Fuel Breakdown Details */}
                  {isExpanded && hasFuelBreakdown && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/50">
                        <div className="p-4 space-y-2">
                          <h4 className="text-sm font-semibold">Detailed Fuel Breakdown:</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {port.fuelBreakdown.map((fuel, idx) => (
                              <div key={idx} className="bg-background rounded-lg p-3 space-y-1">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline">{fuel.type}</Badge>
                                  <span className="text-sm font-semibold">
                                    ${fuel.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {fuel.quantityMT.toFixed(0)} MT × ${fuel.pricePerMT.toFixed(0)}/MT
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Total Quantity:</span>
                              <span>{port.totalQuantityMT.toFixed(0)} MT</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Total Cost:</span>
                              <span className="font-semibold">
                                ${port.totalCostUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

