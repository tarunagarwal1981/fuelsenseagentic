"use strict";
// app/analytics/page.tsx
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AnalyticsPage;
const react_1 = require("react");
const card_1 = require("@/components/ui/card");
const recharts_1 = require("recharts");
function AnalyticsPage() {
    const [metrics, setMetrics] = (0, react_1.useState)({
        manual: { avgDuration: 0, queries: 0 },
        langgraph: { avgDuration: 0, queries: 0 },
    });
    return (<div className="min-h-screen p-8 bg-gray-50">
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
          <card_1.Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Manual Queries
            </div>
            <div className="text-3xl font-bold">
              {metrics.manual.queries}
            </div>
          </card_1.Card>

          <card_1.Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              LangGraph Queries
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.langgraph.queries}
            </div>
          </card_1.Card>

          <card_1.Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Avg Manual Duration
            </div>
            <div className="text-3xl font-bold">
              {metrics.manual.avgDuration}ms
            </div>
          </card_1.Card>

          <card_1.Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">
              Avg LangGraph Duration
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {metrics.langgraph.avgDuration}ms
            </div>
          </card_1.Card>
        </div>

        {/* Chart */}
        <card_1.Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Response Time Comparison
          </h2>
          <recharts_1.ResponsiveContainer width="100%" height={400}>
            <recharts_1.BarChart data={[
            {
                name: "Average Response",
                Manual: metrics.manual.avgDuration,
                LangGraph: metrics.langgraph.avgDuration,
            },
        ]}>
              <recharts_1.CartesianGrid strokeDasharray="3 3"/>
              <recharts_1.XAxis dataKey="name"/>
              <recharts_1.YAxis />
              <recharts_1.Tooltip />
              <recharts_1.Legend />
              <recharts_1.Bar dataKey="Manual" fill="#10b981"/>
              <recharts_1.Bar dataKey="LangGraph" fill="#8b5cf6"/>
            </recharts_1.BarChart>
          </recharts_1.ResponsiveContainer>
        </card_1.Card>
      </div>
    </div>);
}
//# sourceMappingURL=page.js.map