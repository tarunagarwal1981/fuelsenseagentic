'use client';

import { Badge } from '@/components/ui/badge';
import { Trophy, Medal } from 'lucide-react';

interface ComparisonResultCardProps {
  comparison: {
    winner: string;
    winner_reason: string;
    runner_up?: string;
    comparison_factors: string[];
  };
}

export function ComparisonResultCard({ comparison }: ComparisonResultCardProps) {
  return (
    <div className="space-y-4">
      {/* Winner announcement */}
      <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-6 w-6 text-green-600" />
          <span className="text-lg font-bold text-green-700">
            Best Option
          </span>
        </div>
        <p className="text-xl font-semibold mb-2 text-green-900">
          {comparison.winner}
        </p>
        <p className="text-sm text-green-800 leading-relaxed">
          {comparison.winner_reason}
        </p>
      </div>
      
      {/* Runner-up */}
      {comparison.runner_up && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Medal className="h-5 w-5 text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">
              Runner-up
            </span>
          </div>
          <p className="font-medium text-gray-900">
            {comparison.runner_up}
          </p>
        </div>
      )}
      
      {/* Comparison factors */}
      {comparison.comparison_factors.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 mb-2">
            Compared on:
          </h4>
          <div className="flex flex-wrap gap-2">
            {comparison.comparison_factors.map((factor, idx) => (
              <Badge key={idx} variant="outline" className="capitalize">
                {factor.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
