// components/chat-interface-multi-agent.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Bot,
  User,
  Ship,
  Route,
  Cloud,
  Fuel,
  Clock,
  Activity,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  FileStack,
  Lock,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Settings,
  Compass,
  Maximize2,
  Sparkles,
  X,
  FileText,
} from "lucide-react";
import { MultiAgentAnalysisDisplay } from "./multi-agent-analysis-display";
import { ComplianceCard } from './compliance-card';
import { WeatherCard } from './weather-card';
import { EnhancedBunkerTable } from './enhanced-bunker-table';
import { VoyageTimeline } from './voyage-timeline';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import dynamic from "next/dynamic";
import portsData from "@/lib/data/ports.json";
import cachedRoutesData from "@/lib/data/cached-routes.json";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FormattedResponse } from "@/lib/formatters/response-formatter";
import { TemplateResponseContainer } from './template-response';
import type { TemplateFormattedResponse } from '@/lib/formatters/template-aware-formatter';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [thinkingState, setThinkingState] = useState<string | null>(null);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [structuredData, setStructuredData] = useState<TemplateFormattedResponse | null>(null);

  // Debug logging for feature flags
  useEffect(() => {
    console.log('🎨 [FRONTEND] Feature flags:', {
      formatter: isFeatureEnabled('USE_RESPONSE_FORMATTER'),
      hasFormattedResponse: !!structuredData,
    });
  }, [structuredData]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [expandedPopup, setExpandedPopup] = useState(false);
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

    // Reset structured data for new query
    setStructuredData(null);

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
      const endpoint = "/api/chat-multi-agent";

      console.log(`🌐 [MULTI-AGENT-FRONTEND] Fetching ${endpoint}...`);
      
      // Build request body
      const requestBody = {
        message: userMessage.content,
        origin: extractPortCode(userMessage.content, "from"),
        destination: extractPortCode(userMessage.content, "to"),
        ...(selectedRouteId && { selectedRouteId }),
      };
      
      if (selectedRouteId) {
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
                    console.log('📝 [MULTI-AGENT-FRONTEND] Received final_complete event');
                    console.log('📝 [MULTI-AGENT-FRONTEND] Recommendation length:', data.recommendation?.length || 0);
                    assistantMessage = data.recommendation || "Analysis completed.";
                    console.log('📝 [MULTI-AGENT-FRONTEND] Set assistantMessage:', assistantMessage.substring(0, 100));
                    
                    // Store structured data if available
                    if (data.formatted_response) {
                      console.log('🎨 [MULTI-AGENT-FRONTEND] Received formatted response');
                      setStructuredData(data.formatted_response);
                    }
                    
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
        console.log('📝 [MULTI-AGENT-FRONTEND] Adding assistant message, length:', assistantMessage?.length || 0);
        console.log('📝 [MULTI-AGENT-FRONTEND] Assistant message preview:', assistantMessage?.substring(0, 200));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantMessage || "Analysis completed.",
            timestamp: new Date(),
          },
        ]);

        setCurrentAgent(null);
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

  // Chat body (messages + analysis + possible next actions) - shared by right card and expanded popup
  const renderChatBody = () => (
    <>
        {/* Messages Area - white with subtle dotted grid, font sizes per screenshot */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-gray-900 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] bg-[size:16px_16px]">
          <div className="max-w-4xl mx-auto px-4 py-2">
            {messages.some((m) => m.role === "assistant") && (
              <div className="flex items-center justify-between gap-2 mb-2 text-sm text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-green-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3 w-3 text-white" />
                  </div>
                  <span className="font-normal text-gray-900 dark:text-gray-100">Super Agent</span>
                </div>
                <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-normal" disabled>View Source</button>
              </div>
            )}
            <div className="space-y-0.5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`group flex gap-2 py-1 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-green-500 flex items-center justify-center shadow-sm">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <div className={`flex-1 min-w-0 max-w-[85%] ${
                    message.role === "user" ? "flex justify-end" : ""
                  }`}>
                  <div
                      className={`rounded-xl px-3 py-2 ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-gray-100 via-teal-100 to-green-100 dark:from-gray-800/70 dark:via-teal-900/25 dark:to-green-900/25 text-gray-800 dark:text-gray-100 border border-teal-300/70 dark:border-teal-600/50 rounded-xl shadow-sm [&_*]:text-inherit"
                          : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-t-2 border-r-2 border-b-2 border-l-2 border-t-teal-400 border-r-green-500 border-b-teal-300 border-l-teal-300 dark:border-t-teal-600 dark:border-r-green-600 dark:border-b-teal-700 dark:border-l-teal-700 rounded-xl shadow-sm [&_*]:text-inherit"
                    }`}
                  >
                      <div className="prose prose-sm dark:prose-invert max-w-none font-sans text-xs prose-table:!block prose-table:!my-4 [&_table]:!block [&_table]:!my-4 [&_table]:!w-full">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-1 last:mb-0 text-xs leading-relaxed font-sans">{children}</p>,
                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            h1: ({ children }) => <h1 className="text-sm font-bold mb-1 mt-2 first:mt-0 font-sans">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-xs font-bold mb-1 mt-1.5 first:mt-0 font-sans">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-xs font-bold mb-1 mt-1 first:mt-0 font-sans">{children}</h3>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5 text-xs font-sans">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5 text-xs font-sans">{children}</ol>,
                            li: ({ children }) => <li className="ml-1 text-xs font-sans">{children}</li>,
                            code: ({ children }) => <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>,
                            pre: ({ children }) => <pre className="bg-black/10 dark:bg-white/10 p-2 rounded mb-1 overflow-x-auto text-[11px]">{children}</pre>,
                            blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 italic my-1 text-xs font-sans">{children}</blockquote>,
                            a: ({ href, children }) => <a href={href} className="text-blue-600 dark:text-blue-400 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            table: ({ children }) => (
                              <div className="my-4 overflow-x-auto -mx-2 px-2 not-prose">
                                <table className="w-full border-collapse border border-green-200/30 dark:border-green-900/20 rounded-lg overflow-hidden shadow-sm table-auto">
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
                            const extractText = (node: any): string => {
                              if (typeof node === "string") return node;
                              if (typeof node === "number") return String(node);
                              if (Array.isArray(node)) return node.map(extractText).join("");
                              if (node?.props?.children) return extractText(node.props.children);
                              return "";
                            };
                            const rowText = extractText(children);
                            const isBestRow = rowText.includes("BEST") || rowText.includes("⭐") || rowText.includes("vs. Cheapest");
                            return (
                              <tr
                                className={`hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-colors ${
                                  isBestRow ? "bg-green-50/40 dark:bg-green-950/20 border-l-2 border-green-300/50 dark:border-green-600/30" : ""
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
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-green-500 flex items-center justify-center shadow-sm">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {!isLoading && structuredData?.sections_by_tier && (
                <div className="mt-4 p-[1px] rounded-xl bg-gradient-to-r from-teal-200 via-teal-100 to-green-200 dark:from-teal-800/50 dark:via-teal-900/30 dark:to-green-800/50">
                  <div className="rounded-xl bg-white dark:bg-gray-800/95 p-4">
                    <TemplateResponseContainer response={structuredData} />
                  </div>
                </div>
              )}
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
                            currentAgent === "route_agent" ? "bg-blue-50 border-blue-200 text-blue-700" :
                            currentAgent === "weather_agent" ? "bg-cyan-50 border-cyan-200 text-cyan-700" :
                            currentAgent === "bunker_agent" ? "bg-green-50 border-green-200 text-green-700" :
                            "bg-purple-50 border-purple-200 text-purple-700"
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
            {analysisData && (
              <>
                {isFeatureEnabled("USE_RESPONSE_FORMATTER") && structuredData ? (
                  <div className="space-y-4 mt-4">
                    {analysisData.route && (
                      <MultiAgentAnalysisDisplay
                        data={{
                          route: analysisData.route,
                          ports: analysisData.ports,
                          prices: analysisData.prices,
                          analysis: analysisData.analysis,
                        }}
                        mapOverlays={structuredData.mapOverlays}
                      />
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <ComplianceCard data={structuredData.structured.compliance} />
                      <WeatherCard data={structuredData.structured.weather} />
                    </div>
                    <div className="space-y-4">
                      <VoyageTimeline data={structuredData.structured.timeline} />
                      {structuredData.structured.bunker ? (
                        <EnhancedBunkerTable data={structuredData.structured.bunker} />
                      ) : (
                        analysisData.analysis && (
                          <div className="mt-4">
                            <MultiAgentAnalysisDisplay data={{ analysis: analysisData.analysis }} />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <MultiAgentAnalysisDisplay data={analysisData} />
                )}
              </>
            )}
          </div>
        </div>
        {/* Possible next actions */}
        <div className="border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 flex-shrink-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Possible next actions</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-sm font-normal text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600" disabled>Review risk breakdown</Button>
            <Button variant="outline" size="sm" className="text-sm font-normal text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600" disabled>View affected vessels</Button>
            <Button variant="outline" size="sm" className="text-sm font-normal text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600" disabled>Run delay impact simulation</Button>
          </div>
        </div>
    </>
  );

  return (
    <div className="flex h-full bg-gradient-to-br from-green-50/5 via-white to-orange-50/5 dark:from-green-950/5 dark:via-gray-900 dark:to-orange-950/5">
      {/* 1. Narrow dark nav sidebar (placeholder) */}
      <div className="w-16 flex-shrink-0 flex flex-col items-center py-4 bg-gray-800 dark:bg-gray-900 border-r border-gray-700">
        <div className="flex flex-col items-center gap-1 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="text-[10px] text-gray-400 text-center leading-tight">Super agent</span>
          <ChevronDown className="h-3 w-3 text-gray-500" />
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          <button className="flex flex-col items-center gap-1 py-2 px-2 rounded-md bg-gray-700/50 text-white border-l-2 border-blue-500 -ml-px pl-px">
            <Settings className="h-5 w-5" />
            <span className="text-[10px]">Agents</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-2 rounded-md text-gray-400 hover:bg-gray-700/30 hover:text-gray-300">
            <FileStack className="h-5 w-5" />
            <span className="text-[10px]">Projects</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-2 rounded-md text-gray-400 hover:bg-gray-700/30 hover:text-gray-300">
            <Clock className="h-5 w-5" />
            <span className="text-[10px]">Archive</span>
          </button>
        </nav>
        <button className="mt-auto p-2 text-gray-500 hover:text-gray-300 rounded-md">
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* 2. Left content: Today's Intelligence (50% width) - thin border all around, small gap from nav */}
      <div className="flex-1 min-w-0 flex flex-col border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg overflow-hidden ml-2">
        {/* Top header bar: Super agent (left) + Today's Intelligence (right) */}
        <div className="flex items-center justify-between pl-4 pr-4 py-3.5 border-b border-l border-l-gray-300 dark:border-l-gray-600 border-b-gray-200 dark:border-b-gray-600 bg-white dark:bg-gray-800 shrink-0 [border-left-style:dashed]">
          <button type="button" className="flex items-center gap-2 text-left hover:opacity-90 transition-opacity">
            <span className="text-sm font-medium text-[#5E50F3] dark:text-indigo-400">Super agent</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" aria-hidden />
            <ChevronDown className="h-4 w-4 text-gray-700 dark:text-gray-300 shrink-0" />
          </button>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Today&apos;s Intelligence
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Fleet Summary (placeholder) - rounded box with gradient border */}
          <div className="mb-4 p-[1px] rounded-2xl bg-gradient-to-r from-[#ADD8E6] via-sky-100 to-[#FFDAB9] dark:from-sky-800/50 dark:via-slate-700/50 dark:to-amber-800/40 shadow-sm">
            <div className="rounded-2xl bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-3 pt-2 pb-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="relative flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-teal-400 flex items-center justify-center">
                      <Sparkles className="h-1.5 w-1.5 text-white" />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Fleet Summary</span>
                </div>
                <div className="border-b border-gray-200 dark:border-gray-600 mb-2" />
                <div className="grid grid-cols-4 gap-2">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F8F8] dark:bg-gray-700/50 border border-teal-200 dark:border-teal-700/60">
                    <div className="w-6 h-6 rounded-full bg-teal-400 flex items-center justify-center flex-shrink-0">
                      <Ship className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap leading-tight">Fuel Cost Exposure</p>
                      <p className="text-xs font-normal text-gray-700 dark:text-gray-300 mt-0.5">Moderate</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F8F8] dark:bg-gray-700/50 border border-teal-200 dark:border-teal-700/60">
                    <div className="w-6 h-6 rounded-full bg-teal-400 flex items-center justify-center flex-shrink-0">
                      <Ship className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap leading-tight">Fuel Efficiency</p>
                      <p className="text-xs font-normal text-teal-600 dark:text-teal-400 underline cursor-pointer mt-0.5">3 Vessel</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F8F8] dark:bg-gray-700/50 border border-teal-200 dark:border-teal-700/60">
                    <div className="w-6 h-6 rounded-full bg-teal-400 flex items-center justify-center flex-shrink-0">
                      <Ship className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap leading-tight">Emissions Risk</p>
                      <p className="text-xs font-normal text-teal-600 dark:text-teal-400 underline cursor-pointer mt-0.5">1 Vessel</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F8F8] dark:bg-gray-700/50 border border-teal-200 dark:border-teal-700/60">
                    <div className="w-6 h-6 rounded-full bg-teal-400 flex items-center justify-center flex-shrink-0">
                      <Ship className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap leading-tight">Data Reliability</p>
                      <p className="text-xs font-normal text-gray-700 dark:text-gray-300 mt-0.5">high</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Alerts (placeholder) - match screenshot: small bold font, teal accents, card layout */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  Alerts <span className="font-normal text-gray-700 dark:text-gray-300">25</span>
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-normal">
                    View all
                  </button>
                  <button type="button" className="p-0.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="border-b border-gray-200 dark:border-gray-600" />
              <div className="flex gap-3 mt-0 border-b border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  className="text-xs font-bold text-gray-800 dark:text-gray-100 pb-1.5 pt-2 -mb-px border-b-2 border-teal-500 dark:border-teal-400"
                >
                  Active <span className="font-normal text-gray-500 dark:text-gray-400">(15)</span>
                </button>
                <button type="button" className="text-xs font-normal text-gray-500 dark:text-gray-400 pb-1.5 pt-2 -mb-px">
                  Monitoring (5)
                </button>
                <button type="button" className="text-xs font-normal text-gray-500 dark:text-gray-400 pb-1.5 pt-2 -mb-px">
                  CTA (5)
                </button>
              </div>
            </div>
            <div className="space-y-0 max-h-[260px] overflow-y-auto">
              <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80 last:border-b-0 bg-white dark:bg-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100 leading-tight min-w-0">
                    Hull Condition:{" "}
                    <span className="font-normal text-teal-600 dark:text-teal-400 cursor-pointer hover:underline">MV Nova</span>
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Monitoring</span>
                    <div className="w-7 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 relative">
                      <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 rounded-full bg-gray-500 dark:bg-gray-400" />
                    </div>
                    <MessageCircle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
                <p className="text-xs font-normal text-gray-600 dark:text-gray-400 mt-1 leading-snug pr-2">
                  Fuel Consumption is 18% above expect for MV Nova. Power and RPM are stable, Indicating hull Fouling as the primary cause
                </p>
              </div>
              <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80 last:border-b-0 bg-white dark:bg-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100 leading-tight min-w-0">
                    Bad Weather:{" "}
                    <span className="font-normal text-teal-600 dark:text-teal-400 cursor-pointer hover:underline">MV Nova</span>
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Monitoring</span>
                    <div className="w-7 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 relative">
                      <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 rounded-full bg-gray-500 dark:bg-gray-400" />
                    </div>
                    <MessageCircle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
                <p className="text-xs font-normal text-gray-600 dark:text-gray-400 mt-1 leading-snug pr-2">
                  Facing Severe Weather Condition
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Query area at bottom of left pane - light blue border, soft shadow, 3D lift */}
        <div className="relative border-t border-l border-r border-sky-200 dark:border-sky-800 rounded-t-xl pt-4 px-4 pb-5 flex-shrink-0 bg-white dark:bg-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {/* Bottom accent stripe (golden-orange) */}
          <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 dark:from-amber-800/40 dark:via-amber-700/40 dark:to-orange-700/40" />
          <div className="flex gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled
            >
              Show Critical Vessels
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled
            >
              Show Vessel Needing action
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs flex-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled
            >
              Show Monitoring Status
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-2 relative">
            <div className="flex-1 relative rounded-xl overflow-visible">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What can I help you with?"
                className="w-full min-h-[48px] max-h-[160px] px-4 py-3 pr-12 rounded-xl border-2 border-sky-200 dark:border-sky-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-sky-200/50 focus:border-sky-400 dark:focus:border-sky-500 text-sm shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
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
                className="absolute right-2 bottom-2 h-8 w-8 p-0 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-900/20"
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 3. Right content: Sense AI Analysis (50% width) - hidden when expanded */}
      {!expandedPopup && (
      <div className="flex-1 min-w-0 flex flex-col border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg overflow-hidden ml-2">
        {/* Sense AI header bar */}
        <div className="h-14 border-b border-gray-700 bg-gray-800 dark:bg-gray-900 flex items-center justify-between px-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-white text-left">Sense AI Analysis</h1>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="flex items-center gap-1.5 text-sm font-normal text-white">
              <FileText className="h-4 w-4 text-white" />
              Save as Project
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-white hover:bg-gray-700 hover:text-white"
              onClick={() => setExpandedPopup(true)}
              title="Expand chat"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-white hover:bg-gray-700 hover:text-white"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {renderChatBody()}
      </div>
      )}

      {/* Expanded chat: almost full-screen chat interface with query at bottom */}
      {expandedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 dark:bg-black/50" onClick={() => setExpandedPopup(false)}>
          <div
            className="flex flex-col w-[96vw] h-[96vh] max-w-[96vw] max-h-[96vh] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Sense AI Analysis</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100" onClick={() => setExpandedPopup(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {renderChatBody()}
            </div>
            {/* Query field at bottom of expanded window */}
            <div className="relative border-t border-sky-200 dark:border-sky-800 pt-4 px-4 pb-5 flex-shrink-0 bg-white dark:bg-gray-800">
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 dark:from-amber-800/40 dark:via-amber-700/40 dark:to-orange-700/40" />
              <form onSubmit={handleSubmit} className="flex items-end gap-2 relative">
                <div className="flex-1 relative rounded-xl overflow-visible">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="What can I help you with?"
                    className="w-full min-h-[48px] max-h-[160px] px-4 py-3 pr-12 rounded-xl border-2 border-sky-200 dark:border-sky-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-sky-200/50 focus:border-sky-400 dark:focus:border-sky-500 text-sm shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
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
                    className="absolute right-2 bottom-2 h-8 w-8 p-0 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-900/20"
                    disabled={!input.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
