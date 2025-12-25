// app/chat-multi-agent/page.tsx
import { ChatInterfaceMultiAgent } from "@/components/chat-interface-multi-agent";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";

export default function ChatMultiAgentPage() {
  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Minimal top bar - only back button */}
        <div className="h-12 border-b bg-white dark:bg-gray-800 flex items-center px-4 flex-shrink-0">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
        </div>
        
        {/* Full height chat interface */}
        <div className="flex-1 overflow-hidden">
          <ChatInterfaceMultiAgent />
        </div>
      </div>
    </ErrorBoundary>
  );
}

