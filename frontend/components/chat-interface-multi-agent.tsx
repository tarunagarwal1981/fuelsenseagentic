// components/chat-interface-multi-agent.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Bot,
  User,
  Ship,
  Anchor,
  Route,
  Cloud,
  Fuel,
  Clock,
  Activity,
} from "lucide-react";
import { ResultsTable } from "./results-table";
import dynamic from "next/dynamic";
import portsData from "@/lib/data/ports.json";
import Link from "next/link";

// Dynamic import for map (prevents SSR issues with Leaflet)
const MapViewer = dynamic(
  () => import("./map-viewer").then((mod) => mod.MapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    ),
  }
);

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AnalysisData {
  route?: any;
  ports?: any[];
  prices?: any;
  analysis?: any;
  weather_data?: any;
}

interface AgentActivity {
  agent: string;
  status: "active" | "completed" | "pending";
  toolCalls: number;
  startTime?: number;
  endTime?: number;
}

interface PerformanceMetrics {
  totalExecutionTime: number;
  agentTimes: Record<string, number>;
  totalToolCalls: number;
  agentsCalled: string[];
}

export function ChatInterfaceMultiAgent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your multi-agent bunker optimization assistant. I coordinate specialized agents (Route, Weather, Bunker) to provide comprehensive analysis.\n\nJust tell me your origin port, destination port, and fuel requirements.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [useMultiAgent, setUseMultiAgent] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper function to get port details
  const getPortDetails = (portCode: string) => {
    return (portsData as any[]).find((p: any) => p.port_code === portCode);
  };

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAgent, agentActivities]);

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case "route_agent":
        return <Route className="h-4 w-4" />;
      case "weather_agent":
        return <Cloud className="h-4 w-4" />;
      case "bunker_agent":
        return <Fuel className="h-4 w-4" />;
      case "supervisor":
        return <Activity className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case "route_agent":
        return "bg-blue-500";
      case "weather_agent":
        return "bg-cyan-500";
      case "bunker_agent":
        return "bg-green-500";
      case "supervisor":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getAgentLabel = (agent: string) => {
    switch (agent) {
      case "route_agent":
        return "Route Agent";
      case "weather_agent":
        return "Weather Agent";
      case "bunker_agent":
        return "Bunker Agent";
      case "supervisor":
        return "Supervisor";
      default:
        return agent;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    console.log("🚀 [MULTI-AGENT-FRONTEND] Starting chat submission");
    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    console.log(
      "📝 [MULTI-AGENT-FRONTEND] User message:",
      userMessage.content.substring(0, 100)
    );
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setCurrentAgent("supervisor");
    setAgentActivities([]);
    setPerformanceMetrics(null);
    setAnalysisData(null);

    const startTime = Date.now();

    try {
      const endpoint = useMultiAgent
        ? "/api/chat-multi-agent"
        : "/api/chat-langgraph";

      console.log(`🌐 [MULTI-AGENT-FRONTEND] Fetching ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useMultiAgent
            ? {
                message: userMessage.content,
                origin: extractPortCode(userMessage.content, "from"),
                destination: extractPortCode(userMessage.content, "to"),
              }
            : {
                messages: [...messages, userMessage].map((m) => ({
                  role: m.role,
                  content: m.content,
                })),
              }
        ),
      });

      console.log(
        "📡 [MULTI-AGENT-FRONTEND] Response status:",
        response.status,
        response.ok
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (useMultiAgent) {
        // Multi-agent returns JSON directly
        const data = await response.json();
        const executionTime = Date.now() - startTime;

        console.log("📊 [MULTI-AGENT-FRONTEND] Received response:", {
          hasRecommendation: !!data.recommendation,
          hasRoute: !!data.route_data,
          hasWeather: !!data.weather_data,
          hasBunker: !!data.bunker_data,
        });

        // Update agent activities based on metadata
        if (data.metadata) {
          const activities: AgentActivity[] = [];
          const agentsCalled = data.metadata.agents_called || [];

          // Track which agents were called
          if (data.route_data) {
            activities.push({
              agent: "route_agent",
              status: "completed",
              toolCalls: agentsCalled.includes("route_agent") ? 2 : 0,
            });
          }
          if (data.weather_data) {
            activities.push({
              agent: "weather_agent",
              status: "completed",
              toolCalls: agentsCalled.includes("weather_agent") ? 3 : 0,
            });
          }
          if (data.bunker_data) {
            activities.push({
              agent: "bunker_agent",
              status: "completed",
              toolCalls: agentsCalled.includes("bunker_agent") ? 3 : 0,
            });
          }

          setAgentActivities(activities);

          // Set performance metrics
          setPerformanceMetrics({
            totalExecutionTime: data.metadata.execution_time_ms || executionTime,
            agentTimes: {}, // Would need to track this in the API
            totalToolCalls: data.metadata.total_tool_calls || 0,
            agentsCalled: agentsCalled,
          });
        }

        // Set analysis data
        setAnalysisData({
          route: data.route_data,
          ports: data.bunker_data?.recommendations?.map((r: any) => ({
            code: r.port_code,
            name: r.port_name,
            distance_from_route_nm: r.distance_from_route_nm,
          })),
          prices: data.bunker_data?.recommendations?.map((r: any) => ({
            port_code: r.port_code,
            prices: {
              VLSFO: r.fuel_cost_usd / 1000, // Approximate
            },
          })),
          analysis: data.bunker_data,
          weather_data: data.weather_data,
        });

        // Add assistant message
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.recommendation || "Analysis completed.",
            timestamp: new Date(),
          },
        ]);

        setCurrentAgent(null);
      } else {
        // Single-agent uses streaming (existing logic)
        // This would need the streaming logic from chat-interface-langgraph
        // For now, we'll just show a message
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Single-agent mode requires streaming implementation. Please use multi-agent mode.",
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("❌ [MULTI-AGENT-FRONTEND] Error in chat submission:", error);
      setCurrentAgent(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      console.log("🏁 [MULTI-AGENT-FRONTEND] Chat submission finished");
      setIsLoading(false);
      setCurrentAgent(null);
    }
  };

  // Helper to extract port codes from message
  const extractPortCode = (message: string, keyword: string): string | undefined => {
    // Simple extraction - can be improved
    const lowerMessage = message.toLowerCase();
    const keywordIndex = lowerMessage.indexOf(keyword);
    if (keywordIndex === -1) return undefined;

    const afterKeyword = message.substring(keywordIndex + keyword.length).trim();
    const words = afterKeyword.split(/\s+/);
    if (words.length > 0) {
      return words[0];
    }
    return undefined;
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Ship className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold">FuelSense 360</h1>
            <Badge
              variant="secondary"
              className={`${
                useMultiAgent
                  ? "bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {useMultiAgent ? "🤖 Multi-Agent" : "🔷 Single-Agent"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={useMultiAgent ? "default" : "outline"}
              size="sm"
              onClick={() => setUseMultiAgent(true)}
            >
              Multi-Agent
            </Button>
            <Button
              variant={!useMultiAgent ? "default" : "outline"}
              size="sm"
              onClick={() => setUseMultiAgent(false)}
            >
              Single-Agent
            </Button>
            <Link href="/chat-langgraph">
              <Button variant="outline" size="sm">
                LangGraph UI
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground">
          {useMultiAgent
            ? "AI-powered bunker optimization with specialized agents (Route, Weather, Bunker)"
            : "AI-powered bunker optimization powered by LangGraph"}
        </p>
      </div>

      {/* Agent Activity Indicator */}
      {(currentAgent || agentActivities.length > 0) && (
        <Card className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              <span className="font-semibold text-sm">Agent Activity:</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {agentActivities.map((activity, idx) => (
                <Badge
                  key={idx}
                  className={`${getAgentColor(activity.agent)} text-white flex items-center gap-1`}
                >
                  {getAgentIcon(activity.agent)}
                  {getAgentLabel(activity.agent)}
                  {activity.toolCalls > 0 && (
                    <span className="ml-1">({activity.toolCalls})</span>
                  )}
                </Badge>
              ))}
              {currentAgent && (
                <Badge
                  className={`${getAgentColor(currentAgent)} text-white flex items-center gap-1 animate-pulse`}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {getAgentLabel(currentAgent)}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Performance Metrics */}
      {performanceMetrics && (
        <Card className="mb-4 p-3 bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-gray-600" />
            <span className="font-semibold text-sm">Performance Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Total Time</p>
              <p className="font-semibold">
                {performanceMetrics.totalExecutionTime}ms
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tool Calls</p>
              <p className="font-semibold">
                {performanceMetrics.totalToolCalls}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Agents Used</p>
              <p className="font-semibold">
                {performanceMetrics.agentsCalled.length}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Avg per Agent</p>
              <p className="font-semibold">
                {performanceMetrics.agentsCalled.length > 0
                  ? Math.round(
                      performanceMetrics.totalExecutionTime /
                        performanceMetrics.agentsCalled.length
                    )
                  : 0}
                ms
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto mb-4 min-h-0">
        {/* Messages Area */}
        <Card className="mb-4">
          <div className="p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}

                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p
                      className="text-xs opacity-70 mt-1"
                      suppressHydrationWarning
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>

                  {message.role === "user" && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && !currentAgent && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-purple-50 border border-purple-200">
                    <p className="text-sm text-purple-800">
                      Processing with multi-agent system...
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </Card>

        {/* Full Analysis Results */}
        {(analysisData?.route || analysisData?.analysis) && (
          <div className="space-y-4 mb-4">
            {/* Weather Impact Summary */}
            {analysisData.weather_data && (
              <Card className="p-4 bg-cyan-50 border-cyan-200">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-cyan-600" />
                  Weather Impact
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Base Consumption</p>
                    <p className="font-semibold text-lg">
                      {analysisData.weather_data.base_consumption_mt?.toFixed(2) ||
                        "N/A"}{" "}
                      MT
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Adjusted Consumption</p>
                    <p className="font-semibold text-lg">
                      {analysisData.weather_data.adjusted_consumption_mt?.toFixed(
                        2
                      ) || "N/A"}{" "}
                      MT
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Additional Fuel</p>
                    <p className="font-semibold text-lg text-orange-600">
                      +
                      {analysisData.weather_data.additional_fuel_mt?.toFixed(2) ||
                        "N/A"}{" "}
                      MT
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Increase</p>
                    <p className="font-semibold text-lg text-red-600">
                      +
                      {analysisData.weather_data.increase_percent?.toFixed(2) ||
                        "N/A"}
                      %
                    </p>
                  </div>
                </div>
                {analysisData.weather_data.alerts_count > 0 && (
                  <div className="mt-3 p-2 bg-yellow-100 rounded text-sm">
                    ⚠️ {analysisData.weather_data.alerts_count} weather alert(s)
                    detected
                  </div>
                )}
              </Card>
            )}

            {/* Quick Stats */}
            {analysisData?.analysis?.recommendations &&
              analysisData.analysis.recommendations.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Ship className="h-5 w-5" />
                    Analysis Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Best Port</p>
                      <p className="font-semibold text-lg">
                        {analysisData.analysis.best_option?.port_name || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Cost</p>
                      <p className="font-semibold text-lg">
                        $
                        {(
                          analysisData.analysis.best_option?.total_cost_usd ||
                          analysisData.analysis.best_option?.total_cost ||
                          0
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Savings</p>
                      <p className="font-semibold text-lg text-green-600">
                        $
                        {(
                          analysisData.analysis.max_savings_usd ||
                          analysisData.analysis.max_savings ||
                          0
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Options Found</p>
                      <p className="font-semibold text-lg">
                        {analysisData.analysis.recommendations.length}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

            {/* Map */}
            {analysisData.route && (() => {
              const originPort = getPortDetails(
                analysisData.route.origin_port_code
              );
              const destinationPort = getPortDetails(
                analysisData.route.destination_port_code
              );

              if (!originPort || !destinationPort) {
                return (
                  <Card className="p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Anchor className="h-5 w-5" />
                      Route Map
                    </h3>
                    <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                      <div className="text-center">
                        <p className="text-muted-foreground mb-2">
                          Port data not found
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Origin: {analysisData.route.origin_port_code} |
                          Destination: {analysisData.route.destination_port_code}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              }

              return (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Anchor className="h-5 w-5" />
                    Route Map
                  </h3>
                  <MapViewer
                    route={analysisData.route}
                    originPort={originPort}
                    destinationPort={destinationPort}
                    bunkerPorts={
                      (analysisData.analysis?.recommendations
                        ?.map((rec: any) => {
                          const portDetails = getPortDetails(rec.port_code);
                          if (!portDetails) return null;
                          return {
                            ...portDetails,
                            ...rec,
                            coordinates:
                              portDetails.coordinates || {
                                lat: rec.latitude || portDetails.latitude,
                                lon: rec.longitude || portDetails.longitude,
                              },
                          };
                        })
                        .filter((p: any) => p !== null)) ||
                      (analysisData.ports?.map((p: any) => {
                        const portCode = p.code || p.port_code;
                        const portDetails = getPortDetails(portCode);
                        if (!portDetails) return null;
                        return {
                          ...portDetails,
                          ...p,
                          port_code: portCode,
                          port_name: p.name || portDetails.name,
                          coordinates:
                            portDetails.coordinates || {
                              lat: p.latitude || portDetails.latitude,
                              lon: p.longitude || portDetails.longitude,
                            },
                        };
                      }).filter((p: any) => p !== null)) ||
                      []
                    }
                  />
                </Card>
              );
            })()}

            {/* Results Table */}
            {(analysisData.analysis?.recommendations ||
              (analysisData.ports && analysisData.prices)) && (
              <ResultsTable
                recommendations={
                  analysisData.analysis?.recommendations
                    ? analysisData.analysis.recommendations.map((rec: any) => ({
                        port_code: rec.port_code,
                        port_name: rec.port_name || rec.port_code,
                        rank: rec.rank || 0,
                        fuel_price_per_mt:
                          rec.fuel_price_per_mt ||
                          (rec.fuel_cost_usd || rec.fuel_cost || 0) /
                            (rec.fuel_quantity_mt || 1000),
                        fuel_cost: rec.fuel_cost || rec.fuel_cost_usd || 0,
                        deviation_nm:
                          rec.deviation_nm ||
                          rec.distance_from_route_nm ||
                          0,
                        deviation_hours: rec.deviation_hours || 0,
                        deviation_days: rec.deviation_days || 0,
                        deviation_fuel_consumption_mt:
                          rec.deviation_fuel_consumption_mt || 0,
                        deviation_fuel_cost:
                          rec.deviation_fuel_cost || rec.deviation_cost_usd || 0,
                        total_cost: rec.total_cost || rec.total_cost_usd || 0,
                        savings_vs_most_expensive:
                          rec.savings_vs_most_expensive ||
                          rec.savings_vs_worst_usd ||
                          0,
                        savings_percentage: rec.savings_percentage || 0,
                        data_freshness_hours: rec.data_freshness_hours || 0,
                        is_price_stale: rec.is_price_stale || false,
                      }))
                    : []
                }
                fuelQuantity={1000}
                fuelType="VLSFO"
              />
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <Card className="flex-shrink-0">
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about bunker optimization..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

