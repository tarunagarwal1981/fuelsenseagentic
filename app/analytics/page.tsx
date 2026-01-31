// app/analytics/page.tsx
"use client";

import { useState } from "react";
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
  const [metrics] = useState({
    multiAgent: { avgDuration: 0, queries: 0 },
  });

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            Performance Analytics
          </h1>
          <p className="text-muted-foreground">
            Multi-Agent system metrics (run from frontend for full analytics)
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Multi-Agent Queries
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.multiAgent.queries}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Avg Duration
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.multiAgent.avgDuration}ms
            </div>
          </Card>
        </div>

        {/* Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Response Time
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={[
                {
                  name: "Average Response",
                  "Multi-Agent": metrics.multiAgent.avgDuration,
                },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Multi-Agent" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
