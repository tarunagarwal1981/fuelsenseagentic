// app/chat/page.tsx
import { ChatInterface } from "@/components/chat-interface";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <header className="border-b p-4 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">FuelSense 360</h1>
              <p className="text-sm text-muted-foreground">
                Manual Implementation
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/compare">
              <Button variant="outline" size="sm">
                Compare Versions
              </Button>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <ChatInterface />
        </div>
      </div>
    </ErrorBoundary>
  );
}
