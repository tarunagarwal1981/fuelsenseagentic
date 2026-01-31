// app/page.tsx - Landing page is the Multi-Agent chat
import { ChatInterfaceMultiAgent } from "@/components/chat-interface-multi-agent";
import { ErrorBoundary } from "@/components/error-boundary";

export default function HomePage() {
  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex-1 overflow-hidden">
          <ChatInterfaceMultiAgent />
        </div>
      </div>
    </ErrorBoundary>
  );
}
