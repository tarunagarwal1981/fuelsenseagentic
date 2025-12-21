// components/chat-interface-langgraph.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Bot, User, Ship } from "lucide-react";
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
    setAnalysisData(null);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") {
              setCurrentThinking(null);
              if (assistantMessage) {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: assistantMessage,
                    timestamp: new Date(),
                  },
                ]);
              }
              setIsLoading(false);
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "error") {
                console.error("Error:", parsed.error);
                setCurrentThinking(`Error: ${parsed.error}`);
                setIsLoading(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: `Error: ${parsed.error}`,
                    timestamp: new Date(),
                  },
                ]);
                continue;
              }

              if (parsed.type === "graph_event") {
                // Update analysis data if present
                if (parsed.route || parsed.ports || parsed.prices || parsed.analysis) {
                  setAnalysisData({
                    route: parsed.route || null,
                    ports: parsed.ports || null,
                    prices: parsed.prices || null,
                    analysis: parsed.analysis || null,
                  });
                }

                // Handle tool calls
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
                } else if (parsed.message) {
                  // Final answer
                  assistantMessage = parsed.message;
                  setCurrentThinking("Generating response...");
                }
              }
            } catch (parseError) {
              console.error("Parse error:", parseError);
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
    <div className="flex flex-col h-screen max-w-6xl mx-auto p-4">
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

      {/* Messages Area */}
      <Card className="flex-1 mb-4 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto p-4">
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

      {/* Full Analysis Results */}
      {analysisData?.analysis && (
        <div className="space-y-4 mb-4">
          {/* Quick Stats */}
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
                  {analysisData.analysis.best_option?.total_cost_usd?.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 0 }
                  ) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Savings</p>
                <p className="font-semibold text-lg text-green-600">
                  $
                  {analysisData.analysis.max_savings_usd?.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 0 }
                  ) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Options Found</p>
                <p className="font-semibold text-lg">
                  {analysisData.analysis.recommendations?.length || 0}
                </p>
              </div>
            </div>
          </Card>

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
                  <h3 className="font-semibold mb-3">Route Map</h3>
                  <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-2">
                        Port data not found
                      </p>
                    </div>
                  </div>
                </Card>
              );
            }

            return (
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Route Map</h3>
                <MapViewer
                  route={analysisData.route}
                  originPort={originPort}
                  destinationPort={destinationPort}
                  bunkerPorts={
                    analysisData.analysis.recommendations
                      ?.map((rec: any) => {
                        const portDetails = getPortDetails(rec.port_code);
                        return portDetails ? { ...portDetails, ...rec } : null;
                      })
                      .filter((p: any) => p !== null) || []
                  }
                />
              </Card>
            );
          })()}

          {/* Results Table */}
          {analysisData.analysis.recommendations && (
            <ResultsTable
              recommendations={analysisData.analysis.recommendations}
              fuelQuantity={1000}
              fuelType="VLSFO"
            />
          )}
        </div>
      )}

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

