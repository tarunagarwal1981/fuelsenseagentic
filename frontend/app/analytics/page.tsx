// app/analytics/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ABTestComparison {
  singleAgent: {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    averageCost: number;
    averageSatisfaction: number;
    averageAccuracy: number;
  };
  multiAgent: {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    averageCost: number;
    averageSatisfaction: number;
    averageAccuracy: number;
  };
  improvement: {
    responseTime: number;
    successRate: number;
    cost: number;
    satisfaction: number;
    accuracy: number;
  };
  recommendation: "single-agent" | "multi-agent" | "inconclusive";
}

export default function AnalyticsPage() {
  const [comparison, setComparison] = useState<ABTestComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const response = await fetch("/api/ab-test?action=comparison");
      const data = await response.json();
      setComparison(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching A/B test data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const formatPercent = (value: number) => {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

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

  if (!comparison) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No A/B test data available yet.</p>
            <Button onClick={fetchData}>Refresh</Button>
          </Card>
        </div>
      </div>
    );
  }

  const chartData = [
    {
      name: "Response Time",
      "Single-Agent": comparison.singleAgent.averageResponseTime,
      "Multi-Agent": comparison.multiAgent.averageResponseTime,
    },
    {
      name: "Success Rate",
      "Single-Agent": comparison.singleAgent.successRate,
      "Multi-Agent": comparison.multiAgent.successRate,
    },
    {
      name: "Cost per Request",
      "Single-Agent": comparison.singleAgent.averageCost,
      "Multi-Agent": comparison.multiAgent.averageCost,
    },
    {
      name: "Satisfaction (1-5)",
      "Single-Agent": comparison.singleAgent.averageSatisfaction,
      "Multi-Agent": comparison.multiAgent.averageSatisfaction,
    },
    {
      name: "Accuracy (0-1)",
      "Single-Agent": comparison.singleAgent.averageAccuracy,
      "Multi-Agent": comparison.multiAgent.averageAccuracy,
    },
  ];

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold mb-2">A/B Testing Analytics</h1>
          <p className="text-muted-foreground">
              Single-Agent vs Multi-Agent Performance Comparison
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

        {/* Recommendation Badge */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">Recommendation</h2>
              <p className="text-muted-foreground">
                Based on comprehensive analysis of performance metrics
              </p>
            </div>
            <Badge
              variant="secondary"
              className={`text-lg px-4 py-2 ${
                comparison.recommendation === "multi-agent"
                  ? "bg-green-100 text-green-800"
                  : comparison.recommendation === "single-agent"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {comparison.recommendation === "multi-agent"
                ? "✅ Multi-Agent"
                : comparison.recommendation === "single-agent"
                ? "✅ Single-Agent"
                : "⏳ Inconclusive"}
            </Badge>
          </div>
        </Card>

        {/* Key Metrics Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Total Requests</div>
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {comparison.singleAgent.totalRequests}
                </div>
                <div className="text-xs text-muted-foreground">Single-Agent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {comparison.multiAgent.totalRequests}
                </div>
                <div className="text-xs text-muted-foreground">Multi-Agent</div>
            </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {comparison.singleAgent.successRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Single-Agent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {comparison.multiAgent.successRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Multi-Agent</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              {getTrendIcon(comparison.improvement.successRate)}
              <span className={comparison.improvement.successRate > 0 ? "text-green-600" : "text-red-600"}>
                {formatPercent(comparison.improvement.successRate)}
              </span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Avg Response Time</div>
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round(comparison.singleAgent.averageResponseTime)}ms
                </div>
                <div className="text-xs text-muted-foreground">Single-Agent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(comparison.multiAgent.averageResponseTime)}ms
                </div>
                <div className="text-xs text-muted-foreground">Multi-Agent</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              {getTrendIcon(-comparison.improvement.responseTime)}
              <span className={comparison.improvement.responseTime < 0 ? "text-green-600" : "text-red-600"}>
                {formatPercent(comparison.improvement.responseTime)}
              </span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Avg Cost per Request</div>
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  ${comparison.singleAgent.averageCost.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground">Single-Agent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  ${comparison.multiAgent.averageCost.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground">Multi-Agent</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              {getTrendIcon(-comparison.improvement.cost)}
              <span className={comparison.improvement.cost < 0 ? "text-green-600" : "text-red-600"}>
                {formatPercent(comparison.improvement.cost)}
              </span>
            </div>
          </Card>
        </div>

        {/* Comparison Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Performance Comparison</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.slice(0, 3)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Single-Agent" fill="#3b82f6" />
                <Bar dataKey="Multi-Agent" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

        <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Quality Metrics</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.slice(3)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
                <Bar dataKey="Single-Agent" fill="#3b82f6" />
                <Bar dataKey="Multi-Agent" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
          </Card>
        </div>

        {/* Improvement Summary */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Improvement Summary</h2>
          <div className="grid md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Response Time</div>
              <div className={`text-2xl font-bold ${comparison.improvement.responseTime < 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(comparison.improvement.responseTime)}
              </div>
              {comparison.improvement.responseTime < 0 && (
                <div className="text-xs text-green-600 mt-1">Faster</div>
              )}
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
              <div className={`text-2xl font-bold ${comparison.improvement.successRate > 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(comparison.improvement.successRate)}
              </div>
              {comparison.improvement.successRate > 0 && (
                <div className="text-xs text-green-600 mt-1">Better</div>
              )}
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Cost</div>
              <div className={`text-2xl font-bold ${comparison.improvement.cost < 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(comparison.improvement.cost)}
              </div>
              {comparison.improvement.cost < 0 && (
                <div className="text-xs text-green-600 mt-1">Cheaper</div>
              )}
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Satisfaction</div>
              <div className={`text-2xl font-bold ${comparison.improvement.satisfaction > 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(comparison.improvement.satisfaction)}
              </div>
              {comparison.improvement.satisfaction > 0 && (
                <div className="text-xs text-green-600 mt-1">Better</div>
              )}
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Accuracy</div>
              <div className={`text-2xl font-bold ${comparison.improvement.accuracy > 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(comparison.improvement.accuracy)}
              </div>
              {comparison.improvement.accuracy > 0 && (
                <div className="text-xs text-green-600 mt-1">Better</div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
