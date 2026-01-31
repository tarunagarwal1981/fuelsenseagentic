// app/page.tsx - Root app (legacy); primary app is in frontend/
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

        <div className="grid md:grid-cols-1 gap-6 max-w-xl mx-auto">
          <Card className="p-6 hover:shadow-lg transition-shadow border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold mb-2">
                  🤖 Multi-Agent System
                </h2>
                <p className="text-sm text-muted-foreground">
                  The full application runs from the frontend directory.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Run: <code className="bg-gray-100 px-2 py-1 rounded">cd frontend && npm run dev</code>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
