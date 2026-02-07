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

interface DataTableProps {
  data?: Array<Record<string, unknown>>;
  columns?: string[];
  children?: React.ReactNode;
  className?: string;
}

export function DataTable({ data, columns, children, className }: DataTableProps) {
  if (children) {
    return (
      <div className={cn('overflow-x-auto my-4 rounded-lg border', className)}>
        {children}
      </div>
    );
  }
  if (!data?.length) return null;
  const keys = columns ?? Object.keys(data[0] ?? {});
  return (
    <div className={cn('overflow-x-auto my-4 rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {keys.map((key) => (
              <TableHead key={key} className="font-semibold">
                {key.replace(/_/g, ' ')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {keys.map((key) => (
                <TableCell key={key}>{String(row[key] ?? '-')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
