'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

interface ExampleQueriesProps {
  onSelect: (query: string) => void;
}

export function ExampleQueriesMultiAgent({ onSelect }: ExampleQueriesProps) {
  const examples = [
    {
      category: "Basic Bunker Planning",
      queries: [
        "I need 1000 MT VLSFO for Singapore to Rotterdam voyage. Speed 14 knots, 35 MT/day consumption.",
        "Find bunker ports for Dubai to London route. 800 MT VLSFO needed.",
        "Where should I bunker for Tokyo to LA? Need 1200 MT VLSFO + 100 MT LSGO."
      ]
    },
    {
      category: "Weather-Aware Planning",
      queries: [
        "I want to bunker 1000 MT VLSFO from Singapore to Rotterdam. Consider weather safety.",
        "Find safe bunkering ports for monsoon season, Singapore to Rotterdam, 850 MT VLSFO.",
        "Where can I bunker safely with current weather? Need 1000 MT VLSFO, Singapore → Rotterdam."
      ]
    },
    {
      category: "Multi-Fuel Requirements",
      queries: [
        "Need 900 MT VLSFO + 80 MT LSGO for Singapore to Rotterdam. Speed 12 knots.",
        "I require 1000 MT VLSFO and 100 MT MGO, Singapore to Rotterdam, safe ports only.",
        "Find ports with VLSFO (850MT) and LSMGO (75MT), Singapore → Rotterdam route."
      ]
    }
  ];

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Sparkles className="h-4 w-4" />
        <span>Try these examples:</span>
      </div>
      
      {examples.map((category, idx) => (
        <div key={idx}>
          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            {category.category}
          </h4>
          <div className="grid gap-2">
            {category.queries.map((query, qIdx) => (
              <Card
                key={qIdx}
                className="p-3 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 group bg-white border-gray-200"
                onClick={() => onSelect(query)}
              >
                <CardContent className="p-0">
                  <p className="text-sm text-gray-700 group-hover:text-blue-700 transition-colors">
                    {query}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

