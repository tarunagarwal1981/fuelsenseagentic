// app/analytics/page.tsx - Multi-Agent System Analytics
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw } from "lucide-react";

interface SystemMetrics {
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  averageCost: number;
  averageSatisfaction: number;
  averageAccuracy: number;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const response = await fetch("/api/ab-test?action=metrics&variant=multi-agent");
      const data = await response.json();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No analytics data available yet.</p>
            <Button onClick={fetchData}>Refresh</Button>
          </Card>
        </div>
      </div>
    );
  }

  const chartData = [
    { name: "Response Time", value: metrics.averageResponseTime, unit: "ms" },
    { name: "Success Rate", value: metrics.successRate, unit: "%" },
    { name: "Cost per Request", value: metrics.averageCost, unit: "$" },
    { name: "Satisfaction (1-5)", value: metrics.averageSatisfaction, unit: "" },
    { name: "Accuracy (0-1)", value: metrics.averageAccuracy, unit: "" },
  ];

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">System Analytics</h1>
            <p className="text-muted-foreground">
              Multi-Agent System Performance Metrics
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Total Requests</div>
            <div className="text-2xl font-bold text-blue-600">{metrics.totalRequests}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-green-600">
              {metrics.successRate.toFixed(1)}%
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Avg Response Time</div>
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(metrics.averageResponseTime)}ms
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Avg Cost per Request</div>
            <div className="text-2xl font-bold text-cyan-600">
              ${metrics.averageCost.toFixed(4)}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                formatter={(value, _name, props) => {
                  const v = Number(value ?? 0);
                  const unit = props?.payload?.unit;
                  return unit === "$"
                    ? `$${v.toFixed(4)}`
                    : unit === "%"
                    ? `${v.toFixed(1)}%`
                    : v;
                }}
              />
              <Bar dataKey="value" fill="#8b5cf6" name="Value" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
