// app/analytics/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState({
    manual: { avgDuration: 0, queries: 0 },
    langgraph: { avgDuration: 0, queries: 0 },
  });

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            Performance Analytics
          </h1>
          <p className="text-muted-foreground">
            Compare Manual vs LangGraph implementations
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Manual Queries
            </div>
            <div className="text-3xl font-bold">
              {metrics.manual.queries}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              LangGraph Queries
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.langgraph.queries}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Avg Manual Duration
            </div>
            <div className="text-3xl font-bold">
              {metrics.manual.avgDuration}ms
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Avg LangGraph Duration
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.langgraph.avgDuration}ms
            </div>
          </Card>
        </div>

        {/* Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Response Time Comparison
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={[
                {
                  name: "Average Response",
                  Manual: metrics.manual.avgDuration,
                  LangGraph: metrics.langgraph.avgDuration,
                },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Manual" fill="#10b981" />
              <Bar dataKey="LangGraph" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

