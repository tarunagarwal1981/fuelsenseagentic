// components/chat-interface.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Loader2, Ship, Anchor } from 'lucide-react';
import { ResultsTable } from './results-table';
import dynamic from 'next/dynamic';
import portsData from '@/lib/data/ports.json';
import { CardContent } from '@/components/ui/card';

// Dynamic import for map (prevents SSR issues with Leaflet)
const MapViewer = dynamic(
  () => import('./map-viewer').then((mod) => mod.MapViewer),
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
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ToolUse {
  tool: string;
  timestamp: Date;
}

interface AnalysisData {
  route?: any;
  ports?: any[];
  prices?: any;
  analysis?: any;
}

// Example Queries Component
const ExampleQueries = ({ onSelect }: { onSelect: (query: string) => void }) => {
  const examples = [
    {
      title: "Singapore to Rotterdam",
      query: "I need to bunker 1000 MT of VLSFO from Singapore to Rotterdam. My vessel does 14 knots and burns 35 MT per day.",
    },
    {
      title: "Los Angeles to Shanghai",
      query: "Find the cheapest bunker port from Los Angeles to Shanghai for 1500 MT of VLSFO. My ship does 18 knots and consumes 45 MT per day.",
    },
    {
      title: "Houston to Hamburg",
      query: "What are my bunker options from Houston to Hamburg? I need 800 MT of LSGO. Vessel speed is 15 knots, consumption 30 MT/day.",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {examples.map((example, index) => (
        <Card
          key={index}
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onSelect(example.query)}
        >
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">{example.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {example.query}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your bunker optimization assistant. I can help you find the most economical bunker ports for your voyage.\n\nJust tell me your origin port, destination port, and fuel requirements. For example:\n\n\"I need to bunker 1000 MT of VLSFO from Singapore to Rotterdam. My vessel does 14 knots and burns 35 MT per day.\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingState, setThinkingState] = useState<string | null>(null);
  const [toolUses, setToolUses] = useState<ToolUse[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Helper function to get port details
  const getPortDetails = (portCode: string) => {
    return (portsData as any[]).find((p: any) => p.port_code === portCode);
  };
  
  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingState]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    console.log("🚀 [MANUAL-FRONTEND] Starting chat submission");
    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    
    console.log("📝 [MANUAL-FRONTEND] User message:", userMessage.content.substring(0, 100));
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setThinkingState('Starting analysis...');
    setToolUses([]);
    setAnalysisData(null);
    
    try {
      console.log("🌐 [MANUAL-FRONTEND] Fetching /api/chat...");
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          options: {
            fuelQuantityMT: 1000,
            vesselSpeed: 14,
            vesselConsumption: 35,
          },
        }),
      });
      
      console.log("📡 [MANUAL-FRONTEND] Response status:", response.status, response.ok);
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error('No reader available');
      
      let assistantMessage = '';
      let chunkCount = 0;
      let eventCount = 0;
      
      console.log("📥 [MANUAL-FRONTEND] Starting to read stream...");
      while (true) {
        const { done, value } = await reader.read();
        chunkCount++;
        console.log(`📦 [MANUAL-FRONTEND] Chunk #${chunkCount}, done=${done}`);
        
        if (done) {
          console.log("✅ [MANUAL-FRONTEND] Stream reading complete. Total chunks:", chunkCount, "Total events:", eventCount);
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            eventCount++;
            try {
              const data = JSON.parse(line.slice(6));
              console.log(`📨 [MANUAL-FRONTEND] Event #${eventCount}, type: ${data.type}`);
              
              switch (data.type) {
                case 'thinking':
                  console.log(`💭 [MANUAL-FRONTEND] Thinking event - loop: ${data.loop}`);
                  setThinkingState(`Processing (step ${data.loop})...`);
                  break;
                  
                case 'tool_use':
                  console.log(`🔧 [MANUAL-FRONTEND] Tool use event - tool: ${data.tool}`);
                  setToolUses(prev => [...prev, {
                    tool: data.tool,
                    timestamp: new Date(),
                  }]);
                  setThinkingState(`Using ${data.tool}...`);
                  break;
                  
                case 'text':
                  console.log(`📝 [MANUAL-FRONTEND] Text event - content length: ${data.content?.length || 0}`);
                  assistantMessage = data.content;
                  setThinkingState(null);
                  break;
                  
                case 'analysis':
                  console.log("📊 [MANUAL-FRONTEND] Analysis event received:", {
                    hasRoute: !!data.route,
                    portsCount: data.ports?.length || 0,
                    hasPrices: !!data.prices,
                    hasAnalysis: !!data.analysis,
                    recommendationsCount: data.analysis?.recommendations?.length || 0,
                  });
                  setAnalysisData({
                    route: data.route,
                    ports: data.ports,
                    prices: data.prices,
                    analysis: data.analysis,
                  });
                  break;
                  
                case 'done':
                  console.log("🏁 [MANUAL-FRONTEND] Received done signal");
                  setIsLoading(false);
                  if (assistantMessage) {
                    console.log("💬 [MANUAL-FRONTEND] Adding assistant message to UI, length:", assistantMessage.length);
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: assistantMessage,
                      timestamp: new Date(),
                    }]);
                  } else {
                    console.warn("⚠️ [MANUAL-FRONTEND] Done signal received but no assistant message");
                  }
                  break;
                  
                case 'error':
                  console.error("❌ [MANUAL-FRONTEND] Error event:", data.error);
                  setThinkingState(null);
                  setIsLoading(false);
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Error: ${data.error}`,
                    timestamp: new Date(),
                  }]);
                  break;
              }
            } catch (e) {
              console.error('❌ [MANUAL-FRONTEND] Parse error:', e);
              // Skip invalid JSON
            }
          }
        }
      }
      
    } catch (error: any) {
      console.error('❌ [MANUAL-FRONTEND] Error in chat submission:', error);
      setThinkingState(null);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      console.log("🏁 [MANUAL-FRONTEND] Chat submission finished, cleaning up...");
      setIsLoading(false);
      setThinkingState(null);
    }
  };
  
  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'calculate_route': return '🗺️';
      case 'find_ports_near_route': return '⚓';
      case 'fetch_fuel_prices': return '💰';
      case 'analyze_bunker_options': return '📊';
      default: return '🔧';
    }
  };
  
  const getToolLabel = (toolName: string) => {
    switch (toolName) {
      case 'calculate_route': return 'Calculating Route';
      case 'find_ports_near_route': return 'Finding Ports';
      case 'fetch_fuel_prices': return 'Fetching Prices';
      case 'analyze_bunker_options': return 'Analyzing Options';
      default: return toolName;
    }
  };
  
  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Ship className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">FuelSense 360</h1>
        </div>
        <p className="text-muted-foreground">
          AI-powered bunker optimization for maritime vessels
        </p>
      </div>
      
      {/* Example Queries - Show when chat is empty */}
      {messages.length === 1 && (
        <ExampleQueries onSelect={(query) => {
          setInput(query);
        }} />
      )}
      
      {/* Messages Area */}
      <Card className="flex-1 mb-4 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
                
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1" suppressHydrationWarning>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Thinking indicator */}
            {thinkingState && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  </div>
                </div>
                <div className="rounded-lg px-4 py-2 bg-muted">
                  <p className="text-sm">{thinkingState}</p>
                  
                  {/* Tool usage badges */}
                  {toolUses.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {toolUses.map((tool, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {getToolIcon(tool.tool)} {getToolLabel(tool.tool)}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                <p className="font-semibold text-lg">{analysisData.analysis.best_option.port_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Cost</p>
                <p className="font-semibold text-lg">
                  ${analysisData.analysis.best_option.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Savings</p>
                <p className="font-semibold text-lg text-green-600">
                  ${analysisData.analysis.max_savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Options Found</p>
                <p className="font-semibold text-lg">{analysisData.analysis.recommendations.length}</p>
              </div>
            </div>
          </Card>

          {/* Map */}
          {analysisData.route && (() => {
            const originPort = getPortDetails(analysisData.route.origin_port_code);
            const destinationPort = getPortDetails(analysisData.route.destination_port_code);
            
            if (!originPort || !destinationPort) {
              return (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Anchor className="h-5 w-5" />
                    Route Map
                  </h3>
                  <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-2">Port data not found</p>
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
                  bunkerPorts={analysisData.analysis.recommendations
                    .map((rec: any) => {
                      const portDetails = getPortDetails(rec.port_code);
                      return portDetails ? { ...portDetails, ...rec } : null;
                    })
                    .filter((p: any) => p !== null)}
                />
              </Card>
            );
          })()}

          {/* Results Table */}
          <ResultsTable
            recommendations={analysisData.analysis.recommendations}
            fuelQuantity={1000}
            fuelType="VLSFO"
          />
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

