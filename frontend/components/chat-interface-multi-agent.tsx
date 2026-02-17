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
  Route,
  Cloud,
  Fuel,
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
  X,
  FileText,
  Save,
  FilePlus,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
} from "lucide-react";
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import dynamic from "next/dynamic";
import portsData from "@/lib/data/ports.json";
import cachedRoutesData from "@/lib/data/cached-routes.json";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { FormattedResponse } from "@/lib/formatters/response-formatter";
import { TemplateResponseContainer } from './template-response';
import type { TemplateFormattedResponse } from '@/lib/formatters/template-aware-formatter';
import { HybridResponseRenderer } from './hybrid-response-renderer';
import { AlertsPanelFigma } from './alerts-panel-figma';
import { NavSidebarFigma } from './nav-sidebar-figma';
import { WelcomeDashboardFigma } from './welcome-dashboard-figma';
import { ExcessPowerChart } from './charts/excess-power-chart';
import { SpeedLossChart } from './charts/speed-loss-chart';
import { SpeedConsumptionChart } from './charts/speed-consumption-chart';
import type { ExcessPowerChartData } from '@/lib/services/charts/excess-power-chart-service';
import type { SpeedLossChartData } from '@/lib/services/charts/speed-loss-chart-service';
import type { SpeedConsumptionChartData } from '@/lib/services/charts/speed-consumption-chart-service';
import type { BunkerHITLResume } from '@/lib/types/bunker-agent';

type HullChartsState = {
  excessPower?: ExcessPowerChartData | null;
  speedLoss?: SpeedLossChartData | null;
  speedConsumption?: SpeedConsumptionChartData | null;
} | null;

/** Normalize hull_performance_charts from API (camelCase or snake_case) so all three chart types render. */
function normalizeHullPerformanceCharts(raw: unknown): HullChartsState {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    excessPower: (o.excessPower ?? o.excess_power) as ExcessPowerChartData | undefined ?? null,
    speedLoss: (o.speedLoss ?? o.speed_loss) as SpeedLossChartData | undefined ?? null,
    speedConsumption: (o.speedConsumption ?? o.speed_consumption) as SpeedConsumptionChartData | undefined ?? null,
  };
}

/** Merge chart updates: keep existing chart data when new payload omits it (scalable for future chart types). */
function mergeHullCharts(prev: HullChartsState, next: HullChartsState): HullChartsState {
  if (!next) return prev;
  if (!prev) return next;
  return {
    excessPower: next.excessPower ?? prev.excessPower ?? null,
    speedLoss: next.speedLoss ?? prev.speedLoss ?? null,
    speedConsumption: next.speedConsumption ?? prev.speedConsumption ?? null,
  };
}

/** Parse "14 knots laden" / "ballast 12 kt" style text into HITL resume values. Returns null if both speed and load cannot be determined. */
function parseBunkerHitlFromText(
  text: string
): { speed: number; load_condition: 'ballast' | 'laden' } | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let speed: number | null = null;
  const speedMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:knots?|kt\.?|kts?)?/i);
  if (speedMatch) {
    const n = parseFloat(speedMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 30) speed = Math.round(n * 2) / 2;
  }
  let load_condition: 'ballast' | 'laden' | null = null;
  if (/\bballast\b/.test(t)) load_condition = 'ballast';
  if (/\bladen\b/.test(t)) load_condition = 'laden';
  if (speed != null && load_condition != null) return { speed, load_condition };
  return null;
}

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
  const [structuredData, setStructuredData] = useState<
    TemplateFormattedResponse | { type: 'text_only' | 'hybrid'; text?: string; content?: string; components?: Array<{ id: string; component: string; props: Record<string, unknown>; tier: number; priority: number }>; query_type?: string }
  | null>(null);
  const [hullPerformanceCharts, setHullPerformanceCharts] = useState<{
    excessPower?: ExcessPowerChartData | null;
    speedLoss?: SpeedLossChartData | null;
    speedConsumption?: SpeedConsumptionChartData | null;
  } | null>(null);
  const [hullChartTab, setHullChartTab] = useState<'excessPower' | 'speedLoss' | 'speedConsumption'>('excessPower');

  // When hull chart data changes, select first available tab so we never show a blank chart area.
  // Intentionally omit hullChartTab from deps to avoid resetting the tab when the user switches tabs.
  useEffect(() => {
    if (!hullPerformanceCharts) return;
    if (hullChartTab === 'excessPower' && hullPerformanceCharts.excessPower) return;
    if (hullChartTab === 'speedLoss' && hullPerformanceCharts.speedLoss) return;
    if (hullChartTab === 'speedConsumption' && hullPerformanceCharts.speedConsumption) return;
    if (hullPerformanceCharts.excessPower) setHullChartTab('excessPower');
    else if (hullPerformanceCharts.speedLoss) setHullChartTab('speedLoss');
    else if (hullPerformanceCharts.speedConsumption) setHullChartTab('speedConsumption');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when chart data changes, not on tab switch
  }, [hullPerformanceCharts]);

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
  const [senseInsightTab, setSenseInsightTab] = useState<'CP Risk' | 'Performance Drift' | 'Low ROB' | 'Fuel Anomalies' | 'Action Taken'>('CP Risk');
  /** When set, show HITL form for bunker speed/load; on submit send resume with thread_id */
  const [pendingBunkerHitl, setPendingBunkerHitl] = useState<{
    thread_id: string;
    data: { type?: string; question?: string; missing?: string[] };
  } | null>(null);
  const [hitlFormSpeed, setHitlFormSpeed] = useState(12);
  const [hitlFormLoad, setHitlFormLoad] = useState<'ballast' | 'laden'>('laden');
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

  const submitMessage = async (
    messageText: string,
    options?: { resume: BunkerHITLResume; thread_id: string }
  ) => {
    const trimmed = messageText.trim();
    const isResume = Boolean(options?.resume && options?.thread_id);
    if (!isResume && (!trimmed || isLoading)) return;
    if (isResume && isLoading) return;

    // Reset structured data for new query (skip when resuming HITL)
    if (!isResume) setStructuredData(null);

    console.log("🚀 [MULTI-AGENT-FRONTEND] Starting chat submission", isResume ? "(resume)" : "");
    if (!isResume) {
      const userMessage: Message = {
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      console.log(
        "📝 [MULTI-AGENT-FRONTEND] User message:",
        userMessage.content.substring(0, 100)
      );
      setMessages((prev) => [...prev, userMessage]);
    }
    setIsLoading(true);
    setCurrentAgent("supervisor");
    setThinkingState(isResume ? "Resuming bunker analysis..." : "🎯 Planning analysis...");
    if (!isResume) {
      setAgentActivities([]);
      setPerformanceMetrics(null);
      setAnalysisData(null);
      setHullPerformanceCharts(null);
      addAgentLog("supervisor", "Starting analysis...", "start");
    } else {
      addAgentLog("supervisor", "Resuming with speed/load...", "start");
    }

    const startTime = Date.now();

    try {
      const endpoint = "/api/chat-multi-agent";

      console.log(`🌐 [MULTI-AGENT-FRONTEND] Fetching ${endpoint}...`);

      const requestBody = isResume
        ? { message: "", thread_id: options!.thread_id, resume: options!.resume }
        : {
            message: trimmed,
            ...(selectedRouteId && { selectedRouteId }),
          };

      if (!isResume && selectedRouteId) {
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
        let streamEndedByInterrupt = false;

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
                  case "session":
                    // thread_id and correlation_id for continuity; interrupt event carries thread_id for resume
                    break;

                  case "interrupt":
                    setPendingBunkerHitl({
                      thread_id: data.thread_id ?? "",
                      data: (data.data as { type?: string; question?: string; missing?: string[] }) ?? {},
                    });
                    streamEndedByInterrupt = true;
                    break;

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

                  case "hull_charts":
                    if (data.hull_performance_charts != null) {
                      const receivedKeys = Object.keys(data.hull_performance_charts as object);
                      console.log('📨 [MULTI-AGENT-FRONTEND] hull_charts received, keys:', receivedKeys, 'hasSpeedLoss:', !!(data.hull_performance_charts as Record<string, unknown>)?.speedLoss, 'hasSpeedConsumption:', !!(data.hull_performance_charts as Record<string, unknown>)?.speedConsumption);
                      const normalized = normalizeHullPerformanceCharts(data.hull_performance_charts);
                      setHullPerformanceCharts((prev) => {
                        const merged = mergeHullCharts(prev, normalized);
                        return merged && (merged.excessPower || merged.speedLoss || merged.speedConsumption) ? merged : prev ?? null;
                      });
                    }
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
                    // Merge chart data with any from hull_charts so partial final payload never overwrites good data
                    const finalChartsRaw = data.hull_performance_charts;
                    if (finalChartsRaw != null) {
                      const receivedKeys = Object.keys(finalChartsRaw as object);
                      console.log('📨 [MULTI-AGENT-FRONTEND] final_complete hull_performance_charts keys:', receivedKeys, 'hasSpeedLoss:', !!(finalChartsRaw as Record<string, unknown>)?.speedLoss, 'hasSpeedConsumption:', !!(finalChartsRaw as Record<string, unknown>)?.speedConsumption);
                    }
                    const finalCharts = finalChartsRaw != null
                      ? normalizeHullPerformanceCharts(finalChartsRaw)
                      : null;
                    setHullPerformanceCharts((prev) => {
                      const merged = mergeHullCharts(prev, finalCharts);
                      const hasAny = merged && (merged.excessPower || merged.speedLoss || merged.speedConsumption);
                      return hasAny ? merged : null;
                    });
                    
                    setCurrentAgent(null);
                    setThinkingState(null);
                    addAgentLog("supervisor", "Final recommendation ready", "complete");
                    break;

                  case "error":
                    addAgentLog("system", `Error: ${data.error || "Unknown error"}`, "error");
                    setThinkingState(null);
                    throw new Error(data.error || "Unknown error");
                }
                if (streamEndedByInterrupt) break;
              } catch (parseError) {
                console.error("❌ [MULTI-AGENT-FRONTEND] Parse error:", parseError, "Data:", dataStr.substring(0, 200));
              }
            }
            if (streamEndedByInterrupt) break;
          }
        }

        const executionTime = Date.now() - startTime;

        if (!streamEndedByInterrupt) {
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
        }

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    if (pendingBunkerHitl?.thread_id && (pendingBunkerHitl.data?.type === 'bunker_analysis_input' || !pendingBunkerHitl.data?.type)) {
      const parsed = parseBunkerHitlFromText(trimmed);
      if (parsed) {
        handleResumeBunkerHitl(parsed.speed, parsed.load_condition);
        setInput('');
        return;
      }
    }
    submitMessage(trimmed);
    setInput("");
  };

  const handleResumeBunkerHitl = (speed: number, load_condition: 'ballast' | 'laden') => {
    if (!pendingBunkerHitl?.thread_id || isLoading) return;
    const thread_id = pendingBunkerHitl.thread_id;
    setPendingBunkerHitl(null);
    submitMessage('', { resume: { speed, load_condition }, thread_id });
  };

  const handleRequestHullAnalysis = (vesselName: string) => {
    if (!vesselName.trim() || isLoading) return;
    submitMessage(`What is the hull condition of ${vesselName.trim()}?`);
  };

  // Chat body: Figma 9140-65000 welcome dashboard when empty; otherwise messages + answer
  const renderChatBody = () => (
    <>
        {messages.length === 0 && !isLoading ? (
          <WelcomeDashboardFigma />
        ) : (
        <div className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-gray-900 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] bg-[size:16px_16px]">
          <div className="max-w-4xl mx-auto px-4 py-2">
            {(messages.length > 0 || isLoading) && (
            <>
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
              {messages.map((message, index) => {
                const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
                const useHybridRenderer = isLastAssistant && structuredData && 'type' in structuredData && (structuredData.type === 'text_only' || structuredData.type === 'hybrid');

                return (
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
                        {useHybridRenderer ? (
                          <HybridResponseRenderer response={structuredData} className="[&_*]:text-inherit" />
                        ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          remarkRehypeOptions={{ allowDangerousHtml: true }}
                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
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
                        )}
                      </div>
                      {message.role === 'assistant' && isLastAssistant && hullPerformanceCharts && (hullPerformanceCharts.excessPower || hullPerformanceCharts.speedLoss || hullPerformanceCharts.speedConsumption) && (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--figma-Surface-Card-stroke)" }}>
                          <div className="flex flex-wrap gap-1 border-b pb-0" style={{ borderColor: "var(--figma-Surface-Card-stroke)" }}>
                            {hullPerformanceCharts.excessPower && (
                              <button
                                type="button"
                                role="tab"
                                aria-selected={hullChartTab === 'excessPower'}
                                onClick={() => setHullChartTab('excessPower')}
                                className="px-4 py-2.5 text-sm font-medium transition-colors rounded-md border-none cursor-pointer hover:bg-[var(--figma-Grey-03)]"
                                style={{
                                  backgroundColor: hullChartTab === 'excessPower' ? "var(--figma-Primary-Teal)" : "transparent",
                                  color: hullChartTab === 'excessPower' ? "var(--figma-Grey-01)" : "var(--figma-Text-Title)",
                                  fontWeight: hullChartTab === 'excessPower' ? 600 : 500,
                                }}
                              >
                                Excess Power
                              </button>
                            )}
                            {hullPerformanceCharts.speedLoss && (
                              <button
                                type="button"
                                role="tab"
                                aria-selected={hullChartTab === 'speedLoss'}
                                onClick={() => setHullChartTab('speedLoss')}
                                className="px-4 py-2.5 text-sm font-medium transition-colors rounded-md border-none cursor-pointer hover:bg-[var(--figma-Grey-03)]"
                                style={{
                                  backgroundColor: hullChartTab === 'speedLoss' ? "var(--figma-Primary-Teal)" : "transparent",
                                  color: hullChartTab === 'speedLoss' ? "var(--figma-Grey-01)" : "var(--figma-Text-Title)",
                                  fontWeight: hullChartTab === 'speedLoss' ? 600 : 500,
                                }}
                              >
                                Speed Loss
                              </button>
                            )}
                            {hullPerformanceCharts.speedConsumption && (
                              <button
                                type="button"
                                role="tab"
                                aria-selected={hullChartTab === 'speedConsumption'}
                                onClick={() => setHullChartTab('speedConsumption')}
                                className="px-4 py-2.5 text-sm font-medium transition-colors rounded-md border-none cursor-pointer hover:bg-[var(--figma-Grey-03)]"
                                style={{
                                  backgroundColor: hullChartTab === 'speedConsumption' ? "var(--figma-Primary-Teal)" : "transparent",
                                  color: hullChartTab === 'speedConsumption' ? "var(--figma-Grey-01)" : "var(--figma-Text-Title)",
                                  fontWeight: hullChartTab === 'speedConsumption' ? 600 : 500,
                                }}
                              >
                                Speed-Consumption
                              </button>
                            )}
                          </div>
                          {hullChartTab === 'excessPower' && hullPerformanceCharts.excessPower && (
                            <ExcessPowerChart
                              data={hullPerformanceCharts.excessPower}
                              height={380}
                              showThresholds
                              showTrendLine
                            />
                          )}
                          {hullChartTab === 'speedLoss' && hullPerformanceCharts.speedLoss && (
                            <SpeedLossChart
                              data={hullPerformanceCharts.speedLoss}
                              height={380}
                              showTrendLine
                            />
                          )}
                          {hullChartTab === 'speedConsumption' && hullPerformanceCharts.speedConsumption && (
                            <SpeedConsumptionChart
                              data={hullPerformanceCharts.speedConsumption}
                              height={380}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-green-500 flex items-center justify-center shadow-sm">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              );
              })}
              {!isLoading && structuredData && 'sections_by_tier' in structuredData && structuredData.sections_by_tier && (
                <div className="mt-4 p-[1px] rounded-xl bg-gradient-to-r from-teal-200 via-teal-100 to-green-200 dark:from-teal-800/50 dark:via-teal-900/30 dark:to-green-800/50">
                  <div className="rounded-xl bg-white dark:bg-gray-800/95 p-4">
                    <TemplateResponseContainer response={structuredData as TemplateFormattedResponse} />
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
              {pendingBunkerHitl && (pendingBunkerHitl.data?.type === 'bunker_analysis_input' || !pendingBunkerHitl.data?.type) && (
                <Card className="mt-4 p-4 rounded-xl border-2 border-teal-200 dark:border-teal-700 bg-gradient-to-r from-teal-50/80 to-green-50/80 dark:from-teal-950/40 dark:to-green-950/40 shadow-sm max-w-2xl">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                    {pendingBunkerHitl.data?.question ?? 'Please provide sailing speed (knots) and load condition for bunker analysis.'}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Speed (knots)</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Select speed">
                        {[10, 12, 14, 15, 16, 18].map((knots) => (
                          <button
                            key={knots}
                            type="button"
                            aria-pressed={hitlFormSpeed === knots}
                            onClick={() => setHitlFormSpeed(knots)}
                            className={`min-w-[2.5rem] px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                              hitlFormSpeed === knots
                                ? 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-teal-400 dark:hover:border-teal-500'
                            }`}
                          >
                            {knots}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Load condition</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Select load condition">
                        {(['ballast', 'laden'] as const).map((load) => (
                          <button
                            key={load}
                            type="button"
                            aria-pressed={hitlFormLoad === load}
                            onClick={() => setHitlFormLoad(load)}
                            className={`min-w-[5rem] px-4 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${
                              hitlFormLoad === load
                                ? 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-teal-400 dark:hover:border-teal-500'
                            }`}
                          >
                            {load}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleResumeBunkerHitl(hitlFormSpeed, hitlFormLoad)}
                      disabled={isLoading}
                      className="bg-teal-600 hover:bg-teal-700 text-white mt-1"
                    >
                      Continue
                    </Button>
                  </div>
                </Card>
              )}
              <div ref={messagesEndRef} />
            </div>
            </>
            )}
          </div>
        </div>
        )}
    </>
  );

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-green-50/5 via-white to-orange-50/5 dark:from-green-950/5 dark:via-gray-900 dark:to-orange-950/5">
      <div className="flex flex-1 min-h-0">
      {/* 1. Nav sidebar – Figma frame 9140-67962 (as-is, all placeholders) */}
      <NavSidebarFigma />

      {/* 2. Left panel: Figma Alerts frame (9140-67964) – as-is with placeholder content */}
      <AlertsPanelFigma onRequestHullAnalysis={handleRequestHullAnalysis} />

      {/* 3. Right content: Sense AI Analysis (takes remaining width) - hidden when expanded */}
      {!expandedPopup && (
      <div className="flex-1 min-w-0 flex flex-col border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg overflow-hidden ml-2">
        {/* Right panel header – Figma 9140-64986: Playground, Save, New, fullscreen */}
        <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 rounded-t-lg border-b bg-white dark:bg-gray-800 border-fs-border">
          <h1 className="text-left font-semibold tracking-[2px] text-[length:var(--figma-font-size-header-4)] text-foreground">
            Playground
          </h1>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <button type="button" className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground hover:text-foreground">
              <Save className="h-4 w-4 text-muted-foreground" />
              Save
            </button>
            <div className="w-px h-5 bg-fs-border" />
            <button type="button" className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground hover:text-foreground">
              <FilePlus className="h-4 w-4 text-muted-foreground" />
              New
            </button>
            <div className="w-px h-5 bg-fs-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedPopup(true)}
              title="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Light mode" : "Dark mode"}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {renderChatBody()}

        {/* Query area – Figma 58045-833: colors, 3D shadow, Grey/03 buttons (size unchanged) */}
        <div className="flex-shrink-0 pt-1 px-3 pb-1 bg-white dark:bg-gray-800 border-t border-[var(--figma-Grey-03)]">
          <div
            className="rounded-xl border p-2"
            style={{
              backgroundColor: "var(--figma-Surface-Card)",
              borderColor: "var(--figma-Surface-Card-stroke)",
              boxShadow: "2px 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
              <div className="relative rounded-lg overflow-visible">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="What can I help you with?"
                  className="w-full min-h-[32px] max-h-[100px] px-2.5 py-1.5 pr-9 rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-[var(--figma-Primary-Teal)]/30 focus:border-[var(--figma-Primary-Teal)] text-[13px] placeholder-[var(--figma-Text-Secondary)]"
                  style={{
                    backgroundColor: "var(--figma-Grey-01)",
                    borderColor: "var(--figma-Surface-Card-stroke)",
                    color: "var(--figma-Text-Primary)",
                  }}
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
                  className="absolute right-1 bottom-1 h-6 w-6 p-0 hover:opacity-90 min-w-0"
                  style={{ color: "var(--figma-Primary-Teal)" }}
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {['Seek Expert advice', 'Generate Report', 'Generate Presentation', 'Generate Draft Email', 'Show Fleet Summary'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (label === "Show Fleet Summary") {
                        setMessages([]);
                        setInput("");
                      } else {
                        setInput((prev) => (prev ? `${prev} ` : '') + label);
                      }
                    }}
                    className="px-2 py-1 rounded-md border text-[13px] font-normal hover:opacity-90"
                    style={{
                      backgroundColor: "var(--figma-Grey-03)",
                      borderColor: "var(--figma-Surface-Card-stroke)",
                      color: "var(--figma-Text-Title)",
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button type="button" className="p-1 rounded-md hover:opacity-80 ml-auto" style={{ color: "var(--figma-Text-Icon)" }} title="Attach file">
                  <Paperclip className="h-3 w-3" />
                </button>
                <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="Good response">
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="Bad response">
                  <ThumbsDown className="h-3 w-3" />
                </button>
                <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="More options">
                  <MoreVertical className="h-3 w-3" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      </div>

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
            {/* Query field at bottom of expanded window – Figma 58045-833, same theme + 3D shadow */}
            <div className="flex-shrink-0 pt-1 px-3 pb-1 bg-white dark:bg-gray-800 border-t border-[var(--figma-Grey-03)]">
              <div
                className="rounded-xl border p-2"
                style={{
                  backgroundColor: "var(--figma-Surface-Card)",
                  borderColor: "var(--figma-Surface-Card-stroke)",
                  boxShadow: "2px 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
                  <div className="relative rounded-lg overflow-visible">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="What can I help you with?"
                      className="w-full min-h-[32px] max-h-[100px] px-2.5 py-1.5 pr-9 rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-[var(--figma-Primary-Teal)]/30 focus:border-[var(--figma-Primary-Teal)] text-[13px] placeholder-[var(--figma-Text-Secondary)]"
                      style={{
                        backgroundColor: "var(--figma-Grey-01)",
                        borderColor: "var(--figma-Surface-Card-stroke)",
                        color: "var(--figma-Text-Primary)",
                      }}
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
                      className="absolute right-1 bottom-1 h-6 w-6 p-0 hover:opacity-90 min-w-0"
                      style={{ color: "var(--figma-Primary-Teal)" }}
                      disabled={!input.trim() || isLoading}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {['Seek Expert advice', 'Generate Report', 'Generate Presentation', 'Generate Draft Email', 'Show Fleet Summary'].map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          if (label === "Show Fleet Summary") {
                            setMessages([]);
                            setInput("");
                          } else {
                            setInput((prev) => (prev ? `${prev} ` : '') + label);
                          }
                        }}
                        className="px-2 py-1 rounded-md border text-[13px] font-normal hover:opacity-90"
                        style={{
                          backgroundColor: "var(--figma-Grey-03)",
                          borderColor: "var(--figma-Surface-Card-stroke)",
                          color: "var(--figma-Text-Title)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <button type="button" className="p-1 rounded-md hover:opacity-80 ml-auto" style={{ color: "var(--figma-Text-Icon)" }} title="Attach file">
                      <Paperclip className="h-3 w-3" />
                    </button>
                    <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="Good response">
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="Bad response">
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                    <button type="button" className="p-1 rounded-md hover:opacity-80" style={{ color: "var(--figma-Text-Icon)" }} title="More options">
                      <MoreVertical className="h-3 w-3" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
