// components/chat-interface-multi-agent.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  Menu,
  X,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { ResultsTable } from "./results-table";
import { RouteSelector } from "./route-selector";
import { PerformanceMetricsPane } from "./performance-metrics-pane";
import { ExampleQueriesMultiAgent } from "./example-queries-multi-agent";
import { MultiAgentAnalysisDisplay } from "./multi-agent-analysis-display";
import dynamic from "next/dynamic";
import portsData from "@/lib/data/ports.json";
import cachedRoutesData from "@/lib/data/cached-routes.json";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

// Dynamic import for map (prevents SSR issues with Leaflet)
const MapViewer = dynamic(
  () => import("./map-viewer").then((mod) => mod.MapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] bg-muted rounded-lg flex items-center justify-center">
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
  weather?: any;
  weather_data?: any; // Keep for backward compatibility
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

interface AgentLog {
  timestamp: Date;
  agent: string;
  action: string;
  status: 'start' | 'complete' | 'error';
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
  const [thinkingState, setThinkingState] = useState<string | null>(null);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [useMultiAgent, setUseMultiAgent] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [routesExpanded, setRoutesExpanded] = useState(false);
  const [exampleQueriesExpanded, setExampleQueriesExpanded] = useState(false);
  const [agentLogExpanded, setAgentLogExpanded] = useState(true);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [cachedRoutes] = useState((cachedRoutesData.routes || []) as Array<{
    id: string;
    origin_port_code: string;
    destination_port_code: string;
    origin_name: string;
    destination_name: string;
    description: string;
    distance_nm: number;
    estimated_hours: number;
    route_type: string;
    waypoints: Array<{ lat: number; lon: number }>;
    cached_at: string;
    popularity: 'high' | 'medium' | 'low';
  }>);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const agentLogEndRef = useRef<HTMLDivElement>(null);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auto-scroll agent log
  useEffect(() => {
    if (agentLogEndRef.current) {
      agentLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

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
        return <Route className="h-3 w-3" />;
      case "weather_agent":
        return <Cloud className="h-3 w-3" />;
      case "bunker_agent":
        return <Fuel className="h-3 w-3" />;
      case "supervisor":
        return <Activity className="h-3 w-3" />;
      default:
        return <Bot className="h-3 w-3" />;
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

  const getAgentThinkingLabel = (agentName: string): string => {
    const labels: Record<string, string> = {
      'route_agent': '🗺️ Calculating route...',
      'weather_agent': '🌊 Analyzing weather conditions...',
      'bunker_agent': '⚓ Finding optimal bunker ports...',
      'finalize': '📝 Preparing recommendations...',
      'supervisor': '🎯 Planning analysis...'
    };
    return labels[agentName] || `🤖 ${agentName} working...`;
  };

  // Add agent log entry
  const addAgentLog = (agent: string, action: string, status: 'start' | 'complete' | 'error') => {
    setAgentLogs(prev => [...prev, {
      timestamp: new Date(),
      agent,
      action,
      status,
    }]);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
    setThinkingState("🎯 Planning analysis...");
    setAgentActivities([]);
    setPerformanceMetrics(null);
    setAnalysisData(null);
    addAgentLog("supervisor", "Starting analysis...", "start");

    const startTime = Date.now();

    try {
      const endpoint = useMultiAgent
        ? "/api/chat-multi-agent"
        : "/api/chat-langgraph";

      console.log(`🌐 [MULTI-AGENT-FRONTEND] Fetching ${endpoint}...`);
      
      // Build request body
      const requestBody = useMultiAgent
        ? {
            message: userMessage.content,
            origin: extractPortCode(userMessage.content, "from"),
            destination: extractPortCode(userMessage.content, "to"),
            ...(selectedRouteId && { selectedRouteId }),
          }
        : {
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          };
      
      if (selectedRouteId && useMultiAgent) {
        console.log(`🎯 [MULTI-AGENT-FRONTEND] Using cached route: ${selectedRouteId}`);
        addAgentLog("system", `Using cached route: ${selectedRouteId}`, "complete");
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log(
        "📡 [MULTI-AGENT-FRONTEND] Response status:",
        response.status,
        response.ok
      );

      if (!response.ok) {
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorData = await response.json();
          console.error('❌ [MULTI-AGENT-FRONTEND] API Error:', errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          try {
            const errorText = await response.text();
            console.error('❌ [MULTI-AGENT-FRONTEND] API Error (text):', errorText);
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            console.error('❌ [MULTI-AGENT-FRONTEND] Could not parse error response');
          }
        }
        addAgentLog("system", `Error: ${errorMessage}`, "error");
        throw new Error(errorMessage);
      }

      if (useMultiAgent) {
        // Multi-agent returns SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body reader available");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantMessage = "";
        let routeData: any = null;
        let weatherData: any = null;
        let bunkerData: any = null;
        const activities: AgentActivity[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              
              if (dataStr === "[DONE]") {
                continue;
              }

              try {
                const data = JSON.parse(dataStr);
                console.log(`📨 [MULTI-AGENT-FRONTEND] Event type: ${data.type}`);

                switch (data.type) {
                  case "agent_start":
                    setCurrentAgent(data.agent);
                    setThinkingState(getAgentThinkingLabel(data.agent));
                    addAgentLog(data.agent, `${getAgentLabel(data.agent)} started`, "start");
                    break;

                  case "agent_complete":
                    setCurrentAgent(null);
                    setThinkingState(null);
                    addAgentLog(data.agent, `${getAgentLabel(data.agent)} completed`, "complete");
                    break;

                  case "route_data":
                    routeData = data.data;
                    setAnalysisData(prev => ({ ...prev, route: data.data }));
                    activities.push({
                      agent: "route_agent",
                      status: "completed",
                      toolCalls: 2,
                    });
                    setAgentActivities([...activities]);
                    addAgentLog("route_agent", "Route calculation completed", "complete");
                    break;

                  case "route_complete":
                    routeData = data.data;
                    setAnalysisData(prev => ({ ...prev, route: data.data }));
                    activities.push({
                      agent: "route_agent",
                      status: "completed",
                      toolCalls: 2,
                    });
                    setCurrentAgent("route_agent");
                    setAgentActivities([...activities]);
                    addAgentLog("route_agent", "Route calculation completed", "complete");
                    break;

                  case "weather_data":
                    weatherData = {
                      weather_forecast: data.data.weather_forecast,
                      weather_consumption: data.data.weather_consumption,
                      port_weather_status: data.data.port_weather_status,
                      base_consumption_mt: data.data.weather_consumption?.base_consumption_mt,
                      adjusted_consumption_mt: data.data.weather_consumption?.weather_adjusted_consumption_mt,
                      additional_fuel_mt: data.data.weather_consumption?.additional_fuel_needed_mt,
                      increase_percent: data.data.weather_consumption?.consumption_increase_percent,
                      alerts_count: data.data.weather_consumption?.weather_alerts?.length || 0,
                    };
                    setAnalysisData(prev => ({ ...prev, weather: weatherData }));
                    activities.push({
                      agent: "weather_agent",
                      status: "completed",
                      toolCalls: 3,
                    });
                    setAgentActivities([...activities]);
                    addAgentLog("weather_agent", "Weather analysis completed", "complete");
                    break;

                  case "weather_complete":
                    weatherData = data.data;
                    setAnalysisData(prev => ({ ...prev, weather: data.data }));
                    activities.push({
                      agent: "weather_agent",
                      status: "completed",
                      toolCalls: 3,
                    });
                    setCurrentAgent("weather_agent");
                    setAgentActivities([...activities]);
                    addAgentLog("weather_agent", "Weather analysis completed", "complete");
                    break;

                  case "bunker_data":
                    bunkerData = {
                      recommendations: data.data.bunker_analysis?.recommendations || [],
                      best_option: data.data.bunker_analysis?.best_option,
                      worst_option: data.data.bunker_analysis?.worst_option,
                      max_savings_usd: data.data.bunker_analysis?.max_savings_usd,
                      analysis_summary: data.data.bunker_analysis?.analysis_summary,
                    };
                    setAnalysisData(prev => ({
                      ...prev,
                      ports: data.data.bunker_ports || prev?.ports,
                      prices: data.data.port_prices || prev?.prices,
                      analysis: data.data.bunker_analysis || prev?.analysis,
                    }));
                    activities.push({
                      agent: "bunker_agent",
                      status: "completed",
                      toolCalls: 3,
                    });
                    setAgentActivities([...activities]);
                    addAgentLog("bunker_agent", "Bunker analysis completed", "complete");
                    break;

                  case "bunker_complete":
                    bunkerData = data.data;
                    setAnalysisData(prev => ({
                      ...prev,
                      analysis: data.data,
                    }));
                    activities.push({
                      agent: "bunker_agent",
                      status: "completed",
                      toolCalls: 3,
                    });
                    setCurrentAgent("bunker_agent");
                    setAgentActivities([...activities]);
                    addAgentLog("bunker_agent", "Bunker analysis completed", "complete");
                    break;

                  case "final_complete":
                    assistantMessage = data.recommendation || "Analysis completed.";
                    setCurrentAgent(null);
                    setThinkingState(null);
                    addAgentLog("supervisor", "Final recommendation ready", "complete");
                    break;

                  case "error":
                    addAgentLog("system", `Error: ${data.error || "Unknown error"}`, "error");
                    setThinkingState(null);
                    throw new Error(data.error || "Unknown error");
                }
              } catch (parseError) {
                console.error("❌ [MULTI-AGENT-FRONTEND] Parse error:", parseError, "Data:", dataStr.substring(0, 200));
              }
            }
          }
        }

        const executionTime = Date.now() - startTime;

        // Set analysis data (merge with any existing data from progressive updates)
        setAnalysisData(prev => ({
          route: routeData || prev?.route,
          ports: bunkerData?.recommendations?.map((r: any) => ({
            code: r.port_code,
            name: r.port_name,
            distance_from_route_nm: r.distance_from_route_nm || r.deviation_nm,
          })) || prev?.ports,
          prices: bunkerData?.recommendations?.map((r: any) => ({
            port_code: r.port_code,
            prices: {
              VLSFO: r.fuel_cost_usd / 1000,
            },
          })) || prev?.prices,
          analysis: bunkerData || prev?.analysis,
          weather: weatherData || prev?.weather,
        }));

        // Set performance metrics
        setPerformanceMetrics({
          totalExecutionTime: executionTime,
          agentTimes: {},
          totalToolCalls: activities.reduce((sum, a) => sum + (a.toolCalls || 0), 0),
          agentsCalled: activities.map((a) => a.agent),
        });

        // Add assistant message
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantMessage || "Analysis completed.",
            timestamp: new Date(),
          },
        ]);

        setCurrentAgent(null);
      } else {
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
      setThinkingState(null);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "An error occurred. Please try again.";
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${errorMessage}. Please try again or rephrase your question.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      console.log("🏁 [MULTI-AGENT-FRONTEND] Chat submission finished");
      setIsLoading(false);
      setCurrentAgent(null);
      setThinkingState(null);
    }
  };

  // Helper to extract port codes from message
  const extractPortCode = (message: string, keyword: string): string | undefined => {
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
    <div className="flex h-full bg-gradient-to-br from-green-50/5 via-white to-orange-50/5 dark:from-green-950/5 dark:via-gray-900 dark:to-orange-950/5">
      {/* Left Sidebar - 25% width, collapsible */}
      <div className={`${
        leftSidebarCollapsed ? 'w-12' : 'w-[25%] min-w-[280px]'
      } flex flex-col border-r border-green-200/20 dark:border-green-900/10 bg-gradient-to-b from-green-50/15 via-white to-orange-50/15 dark:from-green-950/5 dark:via-gray-800 dark:to-orange-950/5 transition-all duration-300 flex-shrink-0`}>
        {/* Sidebar Header */}
        <div className="h-14 border-b border-green-200/20 dark:border-green-900/10 flex items-center justify-between px-4 flex-shrink-0">
          {!leftSidebarCollapsed && (
            <h2 className="text-sm font-semibold dark:text-white">Tools & Activity</h2>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 ml-auto"
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
          >
            {leftSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {!leftSidebarCollapsed && (
          <div className="flex-1 overflow-y-auto">
            {/* Example Queries Section - Collapsible */}
            <div className="border-b border-green-200/30 dark:border-green-900/15">
              <button
                onClick={() => setExampleQueriesExpanded(!exampleQueriesExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium dark:text-white">Example Queries</span>
                </div>
                {exampleQueriesExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>
              
              {exampleQueriesExpanded && (
                <div className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                  <ExampleQueriesMultiAgent 
                    onSelect={(query) => {
                      setInput(query);
                      // Focus the input field
                      setTimeout(() => {
                        inputRef.current?.focus();
                      }, 100);
                    }} 
                  />
                </div>
              )}
            </div>

            {/* Cached Routes Section - Collapsible */}
            <div className="border-b border-green-200/30 dark:border-green-900/15">
              <button
                onClick={() => setRoutesExpanded(!routesExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium dark:text-white">Cached Routes</span>
                  <Badge variant="secondary" className="text-xs">
                    {cachedRoutes.length}
                  </Badge>
                </div>
                {routesExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>
              
              {routesExpanded && (
                <div className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                  <RouteSelector
                    routes={cachedRoutes}
                    selectedRouteId={selectedRouteId}
                    onRouteSelect={(routeId) => {
                      setSelectedRouteId(routeId);
                      addAgentLog("system", `Route ${routeId} selected`, "complete");
                    }}
                    hideHeader={true}
                  />
                </div>
              )}
            </div>

            {/* Agent Activity Log - Collapsible */}
            <div className="border-b border-green-200/30 dark:border-green-900/15">
              <button
                onClick={() => setAgentLogExpanded(!agentLogExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-orange-50/30 dark:hover:bg-orange-950/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium dark:text-white">Agent Activity</span>
                  {agentLogs.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {agentLogs.length}
                    </Badge>
                  )}
                </div>
                {agentLogExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </button>
              
              {agentLogExpanded && (
                <div className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                  <div className="space-y-1.5">
                    {agentLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No activity yet
                      </p>
                    ) : (
                      agentLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                            log.status === 'complete' 
                              ? 'bg-green-50/40 dark:bg-green-950/20 border-l-2 border-green-300/50 dark:border-green-600/30' 
                              : log.status === 'error' 
                              ? 'bg-red-50/40 dark:bg-red-950/20 border-l-2 border-red-300/50 dark:border-red-600/30'
                              : 'bg-orange-50/30 dark:bg-orange-950/15 border-l-2 border-orange-300/40 dark:border-orange-600/20'
                          }`}
                        >
                          <div className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                            log.status === 'complete' ? 'bg-green-500' :
                            log.status === 'error' ? 'bg-red-500' :
                            'bg-orange-500 animate-pulse'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-medium dark:text-white">
                                {getAgentLabel(log.agent)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-muted-foreground">{log.action}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={agentLogEndRef} />
                  </div>
                </div>
              )}
            </div>

            {/* Performance Metrics */}
            {performanceMetrics && (
              <div className="p-4">
                <PerformanceMetricsPane metrics={performanceMetrics} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Chat Area - 75% width */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal Header */}
        <div className="h-14 border-b border-green-200/20 dark:border-green-900/10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h1 className="text-base font-semibold dark:text-white">FuelSense 360</h1>
            <Badge variant="secondary" className="text-xs">
              {useMultiAgent ? "Multi-Agent" : "Single-Agent"}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            
            <div className="relative">
            <Button
                variant="ghost"
              size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowMenu(!showMenu)}
            >
                <Menu className="h-4 w-4" />
            </Button>
              
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-10 z-20 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                    <button
                      onClick={() => {
                        setUseMultiAgent(true);
                        setShowMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        useMultiAgent ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      Multi-Agent Mode
                    </button>
                    <button
                      onClick={() => {
                        setUseMultiAgent(false);
                        setShowMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        !useMultiAgent ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      Single-Agent Mode
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <Link href="/chat-langgraph">
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                LangGraph UI
                      </button>
                    </Link>
                    <Link href="/compare">
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                        Compare Versions
                      </button>
            </Link>
          </div>
                </>
              )}
        </div>
      </div>
            </div>

        {/* Messages Area - Tight spacing, modern design */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white via-green-50/5 to-orange-50/5 dark:from-gray-900 dark:via-green-950/5 dark:to-orange-950/5">
          <div className="max-w-4xl mx-auto px-4 py-2">

            {/* Messages - Very tight spacing */}
            <div className="space-y-0.5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`group flex gap-2 py-1 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-sm">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}

                  <div className={`flex-1 min-w-0 max-w-[85%] ${
                    message.role === "user" ? "flex justify-end" : ""
                  }`}>
                  <div
                      className={`rounded-xl px-3 py-2 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-gray-800 border border-green-200/20 dark:border-green-900/15 shadow-sm dark:text-gray-100"
                    }`}
                  >
                      <ReactMarkdown
                        className="prose prose-sm dark:prose-invert max-w-none"
                        components={{
                          p: ({ children }) => <p className="mb-1 last:mb-0 text-sm leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-1 mt-2 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-1 mt-1.5 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1 first:mt-0">{children}</h3>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5 text-sm">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5 text-sm">{children}</ol>,
                          li: ({ children }) => <li className="ml-1 text-sm">{children}</li>,
                          code: ({ children }) => <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="bg-black/10 dark:bg-white/10 p-2 rounded mb-1 overflow-x-auto text-xs">{children}</pre>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 italic my-1 text-sm">{children}</blockquote>,
                          a: ({ href, children }) => <a href={href} className="text-blue-600 dark:text-blue-400 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                          table: ({ children }) => (
                            <div className="my-4 overflow-x-auto">
                              <table className="w-full border-collapse border border-green-200/30 dark:border-green-900/20 rounded-lg overflow-hidden shadow-sm">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-b-2 border-blue-200 dark:border-blue-800">
                              {children}
                            </thead>
                          ),
                          tbody: ({ children }) => (
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-green-100/50 dark:divide-green-900/20">
                              {children}
                            </tbody>
                          ),
                          tr: ({ children, ...props }) => {
                            // Helper function to extract text from React nodes
                            const extractText = (node: any): string => {
                              if (typeof node === 'string') return node;
                              if (typeof node === 'number') return String(node);
                              if (Array.isArray(node)) return node.map(extractText).join('');
                              if (node?.props?.children) return extractText(node.props.children);
                              return '';
                            };
                            
                            // Check if row contains "BEST" or "⭐" for special styling
                            const rowText = extractText(children);
                            const isBestRow = rowText.includes('BEST') || rowText.includes('⭐') || rowText.includes('vs. Cheapest');
                            
                            return (
                              <tr 
                                className={`hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-colors ${
                                  isBestRow ? 'bg-green-50/40 dark:bg-green-950/20 border-l-2 border-green-300/50 dark:border-green-600/30' : ''
                                }`}
                                {...props}
                              >
                                {children}
                              </tr>
                            );
                          },
                          th: ({ children }) => (
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-r border-green-200/20 dark:border-green-900/15 last:border-r-0">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 border-r border-green-200/20 dark:border-green-900/15 last:border-r-0">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking Indicator - Fleet Sense Style */}
              {isLoading && thinkingState && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 shadow-sm">
                  <div className="animate-pulse">
                    <div className="h-3 w-3 bg-blue-600 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{thinkingState}</p>
                    {currentAgent && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">Agent:</span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            currentAgent === 'route_agent' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            currentAgent === 'weather_agent' ? 'bg-cyan-50 border-cyan-200 text-cyan-700' :
                            currentAgent === 'bunker_agent' ? 'bg-green-50 border-green-200 text-green-700' :
                            'bg-purple-50 border-purple-200 text-purple-700'
                          }`}
                        >
                          {getAgentLabel(currentAgent)}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Analysis Data Visualization - Inline */}
            {analysisData && (
              <MultiAgentAnalysisDisplay data={analysisData} />
            )}
          </div>
        </div>

        {/* Input Bar - Sticky */}
        <div className="border-t border-green-200/20 dark:border-green-900/10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about routes, weather, or bunker options..."
                  className="w-full min-h-[52px] max-h-[180px] px-4 py-3 pr-12 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-green-400/20 focus:border-orange-300/30 dark:focus:ring-green-600/15 dark:focus:border-orange-600/15 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  disabled={isLoading}
                  rows={1}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 bottom-2 h-8 w-8 p-0"
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
