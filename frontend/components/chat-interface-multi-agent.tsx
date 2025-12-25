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
} from "lucide-react";
import { ResultsTable } from "./results-table";
import { RouteSelector } from "./route-selector";
import { PerformanceMetricsPane } from "./performance-metrics-pane";
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
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [useMultiAgent, setUseMultiAgent] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [routesExpanded, setRoutesExpanded] = useState(true);
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
    setAgentActivities([]);
    setPerformanceMetrics(null);
    setAnalysisData(null);
    setShowSidebar(false);
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
                  case "route_complete":
                    routeData = data.data;
                    activities.push({
                      agent: "route_agent",
                      status: "completed",
                      toolCalls: 2,
                    });
                    setCurrentAgent("route_agent");
                    setAgentActivities([...activities]);
                    addAgentLog("route_agent", "Route calculation completed", "complete");
                    break;

                  case "weather_complete":
                    weatherData = data.data;
                    activities.push({
                      agent: "weather_agent",
                      status: "completed",
                      toolCalls: 3,
                    });
                    setCurrentAgent("weather_agent");
                    setAgentActivities([...activities]);
                    addAgentLog("weather_agent", "Weather analysis completed", "complete");
                    break;

                  case "bunker_complete":
                    bunkerData = data.data;
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
                    addAgentLog("supervisor", "Final recommendation ready", "complete");
                    // Auto-open sidebar when results are ready
                    if (routeData || bunkerData || weatherData) {
                      setShowSidebar(true);
                    }
                    break;

                  case "error":
                    addAgentLog("system", `Error: ${data.error || "Unknown error"}`, "error");
                    throw new Error(data.error || "Unknown error");
                }
              } catch (parseError) {
                console.error("❌ [MULTI-AGENT-FRONTEND] Parse error:", parseError, "Data:", dataStr.substring(0, 200));
              }
            }
          }
        }

        const executionTime = Date.now() - startTime;

        // Set analysis data
        setAnalysisData({
          route: routeData,
          ports: bunkerData?.recommendations?.map((r: any) => ({
            code: r.port_code,
            name: r.port_name,
            distance_from_route_nm: r.distance_from_route_nm,
          })),
          prices: bunkerData?.recommendations?.map((r: any) => ({
            port_code: r.port_code,
            prices: {
              VLSFO: r.fuel_cost_usd / 1000,
            },
          })),
          analysis: bunkerData,
          weather_data: weatherData,
        });

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

  // Quick action prompts
  const quickPrompts = [
    "Calculate route from Singapore to Rotterdam",
    "Find best bunker ports with weather analysis",
    "Compare fuel prices across ports",
    "Get weather forecast for route",
  ];

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
            {/* Quick Prompts - Compact, only show when empty */}
            {messages.length <= 1 && !input && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-2">
                {quickPrompts.map((prompt, idx) => (
                  <button
                  key={idx}
                    onClick={() => setInput(prompt)}
                    className="text-left p-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-green-300/50 dark:hover:border-green-600/30 hover:bg-gradient-to-br hover:from-green-50/30 hover:to-orange-50/20 dark:hover:from-green-950/10 dark:hover:to-orange-950/10 transition-all text-xs dark:text-gray-300 dark:bg-gray-800"
                  >
                    {prompt}
                  </button>
                ))}
            </div>
            )}

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

              {/* Thinking Indicator - Compact */}
              {isLoading && (
                <div className="flex gap-2 py-1">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-gradient-to-br from-green-50/20 via-white to-orange-50/20 dark:from-green-950/10 dark:via-gray-800 dark:to-orange-950/10 border border-green-200/30 dark:border-green-900/20 rounded-xl px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                  </div>
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                      {agentActivities.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {agentActivities.map((activity, idx) => (
                            <Badge 
                              key={idx} 
                              variant="outline" 
                              className={`text-xs ${
                                activity.agent === 'route_agent' 
                                  ? 'bg-blue-50/50 border-blue-200/50 text-blue-700/70'
                                  : activity.agent === 'weather_agent'
                                  ? 'bg-green-50/40 border-green-200/40 text-green-700/60'
                                  : activity.agent === 'bunker_agent'
                                  ? 'bg-orange-50/40 border-orange-200/40 text-orange-700/60'
                                  : 'bg-purple-50/40 border-purple-200/40 text-purple-700/60'
                              }`}
                            >
                              {getAgentIcon(activity.agent)}
                              {getAgentLabel(activity.agent)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
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

      {/* Results Sidebar - Right side, collapsible */}
      {showSidebar && analysisData && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setShowSidebar(false)} />
          <div className="fixed lg:sticky top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto z-50 lg:z-10">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between z-10">
              <h3 className="font-semibold dark:text-white">Analysis Results</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowSidebar(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
            {/* Weather Impact Summary */}
            {analysisData.weather_data && (
                <Card className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 dark:text-white">
                    <Cloud className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  Weather Impact
                </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                      <p className="text-muted-foreground text-xs">Base Consumption</p>
                      <p className="font-semibold text-lg dark:text-white">
                        {analysisData.weather_data.base_consumption_mt?.toFixed(2) || "N/A"} MT
                    </p>
                  </div>
                  <div>
                      <p className="text-muted-foreground text-xs">Adjusted</p>
                      <p className="font-semibold text-lg dark:text-white">
                        {analysisData.weather_data.adjusted_consumption_mt?.toFixed(2) || "N/A"} MT
                    </p>
                  </div>
                  <div>
                      <p className="text-muted-foreground text-xs">Additional Fuel</p>
                      <p className="font-semibold text-lg text-orange-600 dark:text-orange-400">
                        +{analysisData.weather_data.additional_fuel_mt?.toFixed(2) || "N/A"} MT
                    </p>
                  </div>
                  <div>
                      <p className="text-muted-foreground text-xs">Increase</p>
                      <p className="font-semibold text-lg text-red-600 dark:text-red-400">
                        +{analysisData.weather_data.increase_percent?.toFixed(2) || "N/A"}%
                    </p>
                  </div>
                </div>
                {analysisData.weather_data.alerts_count > 0 && (
                    <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded text-sm">
                      ⚠️ {analysisData.weather_data.alerts_count} weather alert(s) detected
                  </div>
                )}
              </Card>
            )}

            {/* Quick Stats */}
            {analysisData?.analysis?.recommendations &&
              analysisData.analysis.recommendations.length > 0 && (
                  <Card className="p-4 dark:bg-gray-700">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 dark:text-white">
                    <Ship className="h-5 w-5" />
                    Analysis Summary
                  </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-muted-foreground text-xs">Best Port</p>
                        <p className="font-semibold text-lg dark:text-white">
                        {analysisData.analysis.best_option?.port_name || "N/A"}
                      </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Total Cost</p>
                        <p className="font-semibold text-lg dark:text-white">
                          ${(
                          analysisData.analysis.best_option?.total_cost_usd ||
                          analysisData.analysis.best_option?.total_cost ||
                          0
                          ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Savings</p>
                        <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                          ${(
                          analysisData.analysis.max_savings_usd ||
                          analysisData.analysis.max_savings ||
                          0
                          ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Options</p>
                        <p className="font-semibold text-lg dark:text-white">
                        {analysisData.analysis.recommendations.length}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

            {/* Map */}
            {analysisData.route && (() => {
                const originPort = getPortDetails(analysisData.route.origin_port_code);
                const destinationPort = getPortDetails(analysisData.route.destination_port_code);

              if (!originPort || !destinationPort) {
                return (
                    <Card className="p-4 dark:bg-gray-700">
                      <h3 className="font-semibold mb-3 flex items-center gap-2 dark:text-white">
                      <Anchor className="h-5 w-5" />
                      Route Map
                    </h3>
                      <div className="w-full h-[400px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                      <div className="text-center">
                          <p className="text-muted-foreground mb-2">Port data not found</p>
                        <p className="text-sm text-muted-foreground">
                            Origin: {analysisData.route.origin_port_code} | Destination: {analysisData.route.destination_port_code}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              }

              return (
                  <Card className="p-4 dark:bg-gray-700">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 dark:text-white">
                    <Anchor className="h-5 w-5" />
                    Route Map
                  </h3>
                  <MapViewer
                    route={analysisData.route}
                    originPort={originPort}
                    destinationPort={destinationPort}
                    bunkerPorts={
                        (analysisData.analysis?.recommendations?.map((rec: any) => {
                          const portDetails = getPortDetails(rec.port_code);
                          if (!portDetails) return null;
                          return {
                            ...portDetails,
                            ...rec,
                            coordinates: portDetails.coordinates || {
                                lat: rec.latitude || portDetails.latitude,
                                lon: rec.longitude || portDetails.longitude,
                              },
                          };
                        }).filter((p: any) => p !== null)) ||
                      (analysisData.ports?.map((p: any) => {
                        const portCode = p.code || p.port_code;
                        const portDetails = getPortDetails(portCode);
                        if (!portDetails) return null;
                        return {
                          ...portDetails,
                          ...p,
                          port_code: portCode,
                          port_name: p.name || portDetails.name,
                            coordinates: portDetails.coordinates || {
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
                <div className="overflow-x-auto">
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
          </div>
        )}

              {/* Performance Metrics */}
              {performanceMetrics && (
                <PerformanceMetricsPane metrics={performanceMetrics} />
              )}
          </div>
      </div>
        </>
      )}

      {/* Sidebar Toggle Button - Show when results available but sidebar closed */}
      {!showSidebar && (analysisData?.route || analysisData?.analysis) && (
        <Button
          variant="default"
          size="sm"
          className="fixed bottom-20 right-4 z-30 shadow-lg lg:hidden"
          onClick={() => setShowSidebar(true)}
        >
          <ChevronRight className="h-4 w-4 mr-2" />
          View Results
        </Button>
      )}
    </div>
  );
}
