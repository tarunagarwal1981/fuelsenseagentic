// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">FuelSense 360</h1>
          <p className="text-xl text-muted-foreground">
            AI-Powered Bunker Optimization
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Manual Version */}
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    ⚙️ Manual Version
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Custom agentic loop
                  </p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                  Production
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>While loop orchestration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Custom tool dispatcher</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Full control & transparency</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Easy to debug</span>
                </div>
              </div>

              <Link href="/chat" className="block">
                <Button className="w-full">Use Manual Version</Button>
              </Link>
            </div>
          </Card>

          {/* LangGraph Version */}
          <Card className="p-6 hover:shadow-lg transition-shadow border-purple-200">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    🔷 LangGraph Version
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Single-agent framework
                  </p>
                </div>
                <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                  Stable
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✓</span>
                  <span>StateGraph orchestration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✓</span>
                  <span>Automatic tool routing</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✓</span>
                  <span>LangSmith monitoring</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✓</span>
                  <span>Visual debugging</span>
                </div>
              </div>

              <Link href="/chat-langgraph" className="block">
                <Button className="w-full bg-purple-600 hover:bg-purple-700">
                  Use LangGraph Version
                </Button>
              </Link>
            </div>
          </Card>

          {/* Multi-Agent Version */}
          <Card className="p-6 hover:shadow-lg transition-shadow border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    🤖 Multi-Agent System
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Specialized agent collaboration
                  </p>
                </div>
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                  New!
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  <span>Route, Weather, Bunker agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  <span>Weather forecasting</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  <span>Performance monitoring</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  <span>A/B testing ready</span>
                </div>
              </div>

              <Link href="/chat-multi-agent" className="block">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  Use Multi-Agent System
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6 bg-gradient-to-r from-green-50 to-purple-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">
                  🔬 Side-by-Side Comparison
                </h3>
                <p className="text-sm text-muted-foreground">
                  Test both versions simultaneously and compare results
                </p>
              </div>
              <Link href="/compare">
                <Button variant="outline">Compare Both</Button>
              </Link>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">
                  📊 A/B Testing Analytics
                </h3>
                <p className="text-sm text-muted-foreground">
                  View performance metrics and compare single vs multi-agent
                </p>
              </div>
              <Link href="/analytics">
                <Button variant="outline">View Analytics</Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">8</div>
            <div className="text-sm text-muted-foreground">Tools Available</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">3</div>
            <div className="text-sm text-muted-foreground">
              Implementations
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">4</div>
            <div className="text-sm text-muted-foreground">
              Specialized Agents
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-cyan-600">1</div>
            <div className="text-sm text-muted-foreground">
              Multi-Agent System
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
