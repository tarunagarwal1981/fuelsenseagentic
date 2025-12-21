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

        <div className="grid md:grid-cols-2 gap-6">
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
                    Enterprise-grade framework
                  </p>
                </div>
                <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                  New!
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
        </div>

        {/* Comparison Link */}
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">4</div>
            <div className="text-sm text-muted-foreground">Tools Available</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">2</div>
            <div className="text-sm text-muted-foreground">
              Implementations
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">1</div>
            <div className="text-sm text-muted-foreground">
              Agentic Pattern
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
