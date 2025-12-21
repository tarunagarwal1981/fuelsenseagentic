// components/chat-interface-langgraph.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Bot, User, Ship, Anchor } from "lucide-react";
import { ResultsTable } from "./results-table";
import dynamic from "next/dynamic";
import portsData from "@/lib/data/ports.json";

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
}

export function ChatInterfaceLangGraph() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your bunker optimization assistant powered by LangGraph. I can help you find the most economical bunker ports for your voyage.\n\nJust tell me your origin port, destination port, and fuel requirements.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

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
  }, [messages, currentThinking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setCurrentThinking("Initializing LangGraph...");
    // Don't clear analysis data immediately - let it persist until new data arrives

    try {
      const response = await fetch("/api/chat-langgraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      let assistantMessage = "";
      let buffer = ""; // Buffer for incomplete lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines
          
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();

            if (data === "[DONE]") {
              setCurrentThinking(null);
              setIsLoading(false);
              break; // Exit the loop when done
            }

            if (!data) continue; // Skip empty data

            try {
              const parsed = JSON.parse(data);

              switch (parsed.type) {
                case "error": {
                  console.error("Error:", parsed.error);
                  setCurrentThinking(null);
                  setIsLoading(false);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: `Error: ${parsed.error}`,
                      timestamp: new Date(),
                    },
                  ]);
                  break;
                }

                case "thinking":
                  setCurrentThinking(parsed.message || "Processing...");
                  break;

                case "text":
                  assistantMessage = parsed.content || "";
                  setCurrentThinking(null);
                  // Display the message immediately if it has content
                  if (assistantMessage.trim()) {
                    setMessages((prev) => {
                      // Check if we already have this message (avoid duplicates)
                      const lastMsg = prev[prev.length - 1];
                      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content === assistantMessage) {
                        return prev;
                      }
                      // Remove any existing incomplete assistant message
                      const filtered = prev.filter((m, idx) => !(idx === prev.length - 1 && m.role === "assistant" && !m.content.trim()));
                      return [...filtered, {
                        role: "assistant",
                        content: assistantMessage,
                        timestamp: new Date(),
                      }];
                    });
                  }
                  break;

                case "analysis":
                  // This is the key event that triggers map/table display (like manual version)
                  console.log("📊 Received analysis event:", {
                    hasRoute: !!parsed.route,
                    hasPorts: !!parsed.ports,
                    hasPrices: !!parsed.prices,
                    hasAnalysis: !!parsed.analysis,
                  });
                  
                  setAnalysisData({
                    route: parsed.route || null,
                    ports: parsed.ports || null,
                    prices: parsed.prices || null,
                    analysis: parsed.analysis || null,
                  });
                  break;

                case "graph_event":
                  // Legacy support - still handle graph_event for backwards compatibility
                  if (parsed.route || parsed.ports || parsed.prices || parsed.analysis) {
                    setAnalysisData((prev) => ({
                      route: parsed.route || prev?.route || null,
                      ports: parsed.ports || prev?.ports || null,
                      prices: parsed.prices || prev?.prices || null,
                      analysis: parsed.analysis || prev?.analysis || null,
                    }));
                  }
                  
                  if (parsed.tool_calls && parsed.tool_calls.length > 0) {
                    const toolName = parsed.tool_calls[0].name;
                    const toolLabels: Record<string, string> = {
                      calculate_route: "Calculating Route",
                      find_bunker_ports: "Finding Bunker Ports",
                      get_fuel_prices: "Fetching Fuel Prices",
                      analyze_bunker_options: "Analyzing Bunker Options",
                    };
                    setCurrentThinking(
                      `Executing: ${toolLabels[toolName] || toolName}...`
                    );
                  }
                  break;
              }
            } catch (parseError) {
              // Handle JSON parse errors gracefully
              if (parseError instanceof SyntaxError) {
                // If it's an unterminated string, the JSON might be split across chunks
                // The buffer will handle it in the next iteration
                if (parseError.message.includes("Unterminated") || parseError.message.includes("JSON")) {
                  console.warn("⚠️ Incomplete JSON chunk, will retry with buffer:", data.substring(0, 100));
                  // Don't throw - just skip this chunk, buffer will handle it
                  continue;
                }
              }
              console.error("Parse error:", parseError, "Data preview:", data.substring(0, 200));
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setCurrentThinking(null);
      setIsLoading(false);
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
    }
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Ship className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">FuelSense 360</h1>
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            🔷 LangGraph Mode
          </Badge>
        </div>
        <p className="text-muted-foreground">
          AI-powered bunker optimization powered by LangGraph
        </p>
      </div>

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
                    <p className="text-xs opacity-70 mt-1" suppressHydrationWarning>
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

              {/* Thinking indicator */}
              {currentThinking && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-purple-50 border border-purple-200">
                    <p className="text-sm text-purple-800">{currentThinking}</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </Card>

        {/* Full Analysis Results - Show if we have route OR analysis */}
        {(analysisData?.route || analysisData?.analysis) && (
          <div className="space-y-4 mb-4">
          {/* Quick Stats - Only show if we have analysis */}
          {analysisData?.analysis?.recommendations && analysisData.analysis.recommendations.length > 0 && (
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
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                    // Use analysis recommendations if available, otherwise use ports from port finder
                    (analysisData.analysis?.recommendations
                      ?.map((rec: any) => {
                        const portDetails = getPortDetails(rec.port_code);
                        if (!portDetails) return null;
                        // Ensure coordinates are in correct format
                        return {
                          ...portDetails,
                          ...rec,
                          coordinates: portDetails.coordinates || {
                            lat: rec.latitude || portDetails.latitude,
                            lon: rec.longitude || portDetails.longitude,
                          },
                        };
                      })
                      .filter((p: any) => p !== null)) ||
                    // Fallback to ports array if no analysis
                    (analysisData.ports?.map((p: any) => {
                      const portCode = p.code || p.port_code;
                      const portDetails = getPortDetails(portCode);
                      if (!portDetails) return null;
                      // Ensure coordinates are in correct format - use portDetails coordinates or construct from lat/lon
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

          {/* Results Table - Show if we have analysis recommendations OR ports with prices */}
          {(analysisData.analysis?.recommendations || (analysisData.ports && analysisData.prices)) && (
            <ResultsTable
              recommendations={
                analysisData.analysis?.recommendations
                  ? analysisData.analysis.recommendations.map((rec: any) => ({
                      port_code: rec.port_code,
                      port_name: rec.port_name || rec.port_code,
                      rank: rec.rank || 0,
                      fuel_price_per_mt: rec.fuel_price_per_mt || (rec.fuel_cost_usd || rec.fuel_cost || 0) / (rec.fuel_quantity_mt || 1000),
                      fuel_cost: rec.fuel_cost || rec.fuel_cost_usd || 0,
                      deviation_nm: rec.deviation_nm || rec.distance_from_route_nm || 0,
                      deviation_hours: rec.deviation_hours || 0,
                      deviation_days: rec.deviation_days || 0,
                      deviation_fuel_consumption_mt: rec.deviation_fuel_consumption_mt || 0,
                      deviation_fuel_cost: rec.deviation_fuel_cost || rec.deviation_cost_usd || 0,
                      total_cost: rec.total_cost || rec.total_cost_usd || 0,
                      savings_vs_most_expensive: rec.savings_vs_most_expensive || rec.savings_vs_worst_usd || 0,
                      savings_percentage: rec.savings_percentage || 0,
                      data_freshness_hours: rec.data_freshness_hours || 0,
                      is_price_stale: rec.is_price_stale || false,
                    }))
                  : // Fallback: create recommendations from ports and prices
                    (() => {
                      const fuelQuantity = 1000; // Default
                      const vesselSpeed = 14; // Default knots
                      const vesselConsumption = 35; // Default MT/day
                      
                      const recommendations = (analysisData.ports || []).map((port: any, index: number) => {
                        const portCode = port.code || port.port_code;
                        const priceData = analysisData.prices?.find((p: any) => (p.port_code || p.code) === portCode);
                        const vlsfoPrice = priceData?.prices?.VLSFO || 0;
                        const distanceFromRoute = port.distance_from_route_nm || 0;
                        
                        // Calculate deviation metrics
                        const deviationNm = distanceFromRoute * 2; // Round trip
                        const deviationHours = deviationNm / vesselSpeed;
                        const deviationDays = deviationHours / 24;
                        const deviationFuelConsumption = deviationDays * vesselConsumption;
                        const deviationFuelCost = deviationFuelConsumption * vlsfoPrice;
                        
                        // Calculate costs
                        const fuelCost = vlsfoPrice * fuelQuantity;
                        const totalCost = fuelCost + deviationFuelCost;
                        
                        return {
                          port_code: portCode,
                          port_name: port.name || port.port_name || portCode,
                          rank: index + 1,
                          fuel_price_per_mt: vlsfoPrice,
                          fuel_cost: fuelCost,
                          deviation_nm: deviationNm,
                          deviation_hours: deviationHours,
                          deviation_days: deviationDays,
                          deviation_fuel_consumption_mt: deviationFuelConsumption,
                          deviation_fuel_cost: deviationFuelCost,
                          total_cost: totalCost,
                          savings_vs_most_expensive: 0, // Will calculate below
                          savings_percentage: 0, // Will calculate below
                          data_freshness_hours: 0,
                          is_price_stale: false,
                        };
                      });
                      
                      // Calculate savings
                      if (recommendations.length > 0) {
                        const sortedByCost = [...recommendations].sort((a, b) => b.total_cost - a.total_cost);
                        const mostExpensive = sortedByCost[0].total_cost;
                        
                        recommendations.forEach((rec) => {
                          rec.savings_vs_most_expensive = mostExpensive - rec.total_cost;
                          rec.savings_percentage = mostExpensive > 0 ? (rec.savings_vs_most_expensive / mostExpensive) * 100 : 0;
                        });
                        
                        // Re-rank by total cost
                        recommendations.sort((a, b) => a.total_cost - b.total_cost);
                        recommendations.forEach((rec, idx) => {
                          rec.rank = idx + 1;
                        });
                      }
                      
                      return recommendations;
                    })()
              }
              fuelQuantity={1000}
              fuelType="VLSFO"
            />
          )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex gap-2">
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
      </form>
    </div>
  );
}

