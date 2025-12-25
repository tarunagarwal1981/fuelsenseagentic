/**
 * Performance Metrics Pane Component
 * 
 * Compact, collapsible performance metrics display.
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PerformanceMetrics {
  totalExecutionTime: number;
  agentTimes: Record<string, number>;
  totalToolCalls: number;
  agentsCalled: string[];
}

interface PerformanceMetricsPaneProps {
  metrics: PerformanceMetrics | null;
}

export function PerformanceMetricsPane({ metrics }: PerformanceMetricsPaneProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metrics) return null;

  return (
    <Card className="p-3 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="font-semibold text-xs dark:text-white">Performance</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Always visible summary */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <div>
          <p className="text-muted-foreground text-xs">Total</p>
          <p className="font-semibold dark:text-white">{metrics.totalExecutionTime}ms</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Tools</p>
          <p className="font-semibold dark:text-white">{metrics.totalToolCalls}</p>
        </div>
      </div>

      {/* Expandable details */}
      {isExpanded && (
        <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
          <div>
            <p className="text-muted-foreground text-xs">Agents</p>
            <p className="font-semibold dark:text-white">{metrics.agentsCalled.length}</p>
          </div>
          {metrics.agentsCalled.length > 0 && Object.keys(metrics.agentTimes || {}).length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Agent Times</p>
              {metrics.agentsCalled.map((agent) => (
                <div key={agent} className="flex justify-between text-xs">
                  <span className="text-muted-foreground capitalize">
                    {agent.replace("_", " ")}
                  </span>
                  <span className="font-medium dark:text-white">
                    {metrics.agentTimes[agent] || 0}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

