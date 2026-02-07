'use client';

/**
 * Hybrid Markdown + React Component Renderer
 *
 * Renders markdown content with custom React components for interactive elements.
 * - Pure markdown for 90% of content (safe, exportable)
 * - React components for the 10% that needs interactivity
 * - No security risks (markdown is sanitized by default)
 * - Beautiful rendering with Tailwind
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { CostComparison } from '@/components/ui/cost-comparison';
import { RouteMap } from '@/components/ui/route-map';

interface HybridMarkdownRendererProps {
  content: string;
  className?: string;
}

export function HybridMarkdownRenderer({ content, className }: HybridMarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom heading renderer - h2 with 🔽 renders as section header
          // For full collapsible sections, use ```collapsible code block with
          // {"title": "...", "content": "markdown..."}
          h2: ({ children, ...props }) => {
            const text =
              typeof children === 'string'
                ? children
                : Array.isArray(children)
                  ? String(children[0] ?? '')
                  : String(children ?? '');
            const title = text.includes('🔽') ? text.replace('🔽', '').trim() : text;
            return (
              <h2
                className="text-2xl font-bold mt-6 mb-3 text-foreground"
                {...props}
              >
                {title}
              </h2>
            );
          },

          h3: ({ children, ...props }) => (
            <h3
              className="text-xl font-semibold mt-4 mb-2 text-foreground"
              {...props}
            >
              {children}
            </h3>
          ),

          // Custom table renderer with overflow handling
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-lg border">
              <table
                className="min-w-full divide-y divide-border border-collapse"
                {...props}
              >
                {children}
              </table>
            </div>
          ),

          thead: ({ children, ...props }) => (
            <thead className="bg-muted/50" {...props}>
              {children}
            </thead>
          ),

          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-border" {...props}>
              {children}
            </tbody>
          ),

          tr: ({ children, ...props }) => (
            <tr className="hover:bg-muted/30 transition-colors" {...props}>
              {children}
            </tr>
          ),

          th: ({ children, ...props }) => (
            <th
              className="px-4 py-2 text-left text-sm font-semibold text-foreground"
              {...props}
            >
              {children}
            </th>
          ),

          td: ({ children, ...props }) => (
            <td className="px-4 py-2 text-sm text-foreground" {...props}>
              {children}
            </td>
          ),

          // Custom code block for special components
          code: ({ className, children, ...props }) => {
            const langMatch = /language-(\w+)/.exec(className || '');
            const language = langMatch?.[1];
            const isBlock = !!language;
            const codeString = String(children ?? '').trim();

            if (language === 'cost-comparison') {
              try {
                const data = JSON.parse(codeString);
                return <CostComparison data={data} />;
              } catch {
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">
                    <code {...props}>{children}</code>
                  </pre>
                );
              }
            }

            if (language === 'route-map') {
              try {
                const data = JSON.parse(codeString);
                return <RouteMap routeData={data} />;
              } catch {
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">
                    <code {...props}>{children}</code>
                  </pre>
                );
              }
            }

            if (language === 'collapsible') {
              try {
                const { title, content } = JSON.parse(codeString);
                return (
                  <CollapsibleSection title={title ?? 'Section'} defaultOpen={true}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ''}</ReactMarkdown>
                  </CollapsibleSection>
                );
              } catch {
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">
                    <code {...props}>{children}</code>
                  </pre>
                );
              }
            }

            if (!isBlock) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">
                <code className="text-sm font-mono" {...props}>
                  {children}
                </code>
              </pre>
            );
          },

          // Custom link rendering (security: noopener noreferrer)
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              {...props}
            >
              {children}
            </a>
          ),

          // Custom blockquote for alerts/warnings
          blockquote: ({ children }) => (
            <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-4 my-4 rounded-r-lg">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-500 shrink-0">⚠️</span>
                <div className="text-yellow-900 dark:text-yellow-100">{children}</div>
              </div>
            </div>
          ),

          // Paragraph styling
          p: ({ children, ...props }) => (
            <p className="mb-3 leading-relaxed text-foreground" {...props}>
              {children}
            </p>
          ),

          // List styling
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside mb-3 space-y-1" {...props}>
              {children}
            </ul>
          ),

          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1" {...props}>
              {children}
            </ol>
          ),

          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-foreground" {...props}>
              {children}
            </strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
