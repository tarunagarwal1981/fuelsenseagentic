// app/page.tsx
import { ChatInterface } from '@/components/chat-interface';
import { ErrorBoundary } from '@/components/error-boundary';

export default function Home() {
  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-background">
        <ChatInterface />
      </main>
    </ErrorBoundary>
  );
}
