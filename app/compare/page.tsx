// app/compare/page.tsx
import { ChatInterface } from "@/components/chat-interface";
import { ChatInterfaceLangGraph } from "@/components/chat-interface-langgraph";

export default function ComparePage() {
  return (
    <div className="h-screen flex flex-col">
      <header className="border-b p-4 bg-white">
        <h1 className="text-2xl font-bold">
          FuelSense 360 - Architecture Comparison
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare Manual Implementation vs LangGraph
        </p>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Manual Version */}
        <div className="border rounded-lg overflow-hidden flex flex-col">
          <div className="bg-green-100 border-b p-3">
            <h2 className="font-semibold text-green-900">
              ⚙️ Manual Implementation
            </h2>
            <p className="text-xs text-green-700 mt-1">
              Custom while loop + switch/case
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatInterface />
          </div>
        </div>

        {/* LangGraph Version */}
        <div className="border rounded-lg overflow-hidden flex flex-col">
          <div className="bg-purple-100 border-b p-3">
            <h2 className="font-semibold text-purple-900">
              🔷 LangGraph Implementation
            </h2>
            <p className="text-xs text-purple-700 mt-1">
              StateGraph + Agent Node + Tool Node
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatInterfaceLangGraph />
          </div>
        </div>
      </div>

      <footer className="border-t p-3 bg-gray-50 text-center text-sm text-muted-foreground">
        Ask the same question in both - compare responses, speed, and behavior
      </footer>
    </div>
  );
}

