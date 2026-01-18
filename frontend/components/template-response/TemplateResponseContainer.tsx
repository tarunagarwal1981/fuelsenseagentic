/**
 * Template Response Container
 * 
 * Renders responses with progressive disclosure.
 * - Tier 1: Always visible (primary content)
 * - Tier 2: Expandable (key insights)
 * - Tier 3: Technical details (collapsed by default)
 */

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { TemplateFormattedResponse, RenderedSection } from '@/lib/formatters/template-aware-formatter';
import type { ExtractedInsight } from '@/lib/formatters/insight-extractor';
import { getSectionIcon, stripEmojiPrefix, TIER_STYLES } from './section-icons';

interface Props {
  response: TemplateFormattedResponse;
}

export default function TemplateResponseContainer({ response }: Props) {
  if (!response.sections_by_tier) {
    // Fallback to text rendering
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{response.text || ''}</ReactMarkdown>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Dev metadata */}
      {process.env.NODE_ENV === 'development' && response.template_metadata && (
        <div className="text-xs text-gray-500 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-600 pl-3">
          Template: {response.template_metadata.template_name} v{response.template_metadata.version} 
          ({response.template_metadata.sections_count} sections, {response.template_metadata.rules_applied} rules applied)
        </div>
      )}
      
      {/* Critical insights first */}
      {response.insights && response.insights.filter(i => i.priority === 'critical').length > 0 && (
        <CriticalInsightsAlert insights={response.insights.filter(i => i.priority === 'critical')} />
      )}
      
      {/* Tier 1: Always visible */}
      <div className="space-y-4">
        {response.sections_by_tier.tier_1_visible.map((section) => (
          <Tier1Section key={section.id} section={section} />
        ))}
      </div>
      
      {/* Tier 2: Key insights (expandable) */}
      {response.sections_by_tier.tier_2_expandable.length > 0 && (
        <div className="mt-6 space-y-3">
          {response.sections_by_tier.tier_2_expandable.map((section) => (
            <ExpandableSection key={section.id} section={section} tier={2} />
          ))}
        </div>
      )}
      
      {/* Tier 3: Technical details (collapsed by default) */}
      {response.sections_by_tier.tier_3_technical.length > 0 && (
        <details className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium">
            Technical Details ({response.sections_by_tier.tier_3_technical.length} sections)
          </summary>
          <div className="mt-4 space-y-3">
            {response.sections_by_tier.tier_3_technical.map((section) => (
              <ExpandableSection key={section.id} section={section} tier={3} />
            ))}
          </div>
        </details>
      )}
      
      {/* Other insights */}
      {response.insights && response.insights.filter(i => i.priority !== 'critical').length > 0 && (
        <InsightsPanel insights={response.insights.filter(i => i.priority !== 'critical')} />
      )}
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Critical insights displayed prominently at the top
 */
function CriticalInsightsAlert({ insights }: { insights: ExtractedInsight[] }) {
  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <div 
          key={insight.id} 
          className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg"
        >
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{insight.message}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tier 1 section - always visible card with prominent styling
 */
function Tier1Section({ section }: { section: RenderedSection }) {
  const icon = getSectionIcon(section.id);
  const cleanTitle = stripEmojiPrefix(section.title);
  const styles = TIER_STYLES[1];
  
  return (
    <div className={`${styles.bg} rounded-lg border ${styles.border} shadow-sm p-5 ${styles.hover} transition-all duration-200`}>
      <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${styles.text}`}>
        <span className="text-2xl">{icon}</span>
        <span>{cleanTitle}</span>
      </h3>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{section.content}</ReactMarkdown>
      </div>
      {section.truncated && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          * Content truncated to {section.word_count} words
        </p>
      )}
    </div>
  );
}

/**
 * Expandable section for Tier 2/3 content
 */
function ExpandableSection({ section, tier }: { section: RenderedSection; tier: 2 | 3 }) {
  const [isExpanded, setIsExpanded] = useState(!section.collapsed);
  const icon = getSectionIcon(section.id);
  const cleanTitle = stripEmojiPrefix(section.title);
  const styles = TIER_STYLES[tier];
  
  return (
    <div className={`border rounded-lg ${styles.bg} ${styles.border} transition-all duration-200`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 text-left flex items-center justify-between ${styles.hover} transition-colors rounded-lg`}
      >
        <span className={`font-medium text-sm flex items-center gap-2 ${styles.text}`}>
          <span className="text-lg">{icon}</span>
          <span>{cleanTitle}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            ({section.word_count} words)
          </span>
        </span>
        <span 
          className={`text-gray-500 dark:text-gray-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 prose prose-sm max-w-none dark:prose-invert animate-fadeIn">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * Panel for non-critical insights/recommendations
 */
function InsightsPanel({ insights }: { insights: ExtractedInsight[] }) {
  if (insights.length === 0) return null;
  
  // Group by priority
  const highPriority = insights.filter(i => i.priority === 'high');
  const mediumPriority = insights.filter(i => i.priority === 'medium');
  const lowPriority = insights.filter(i => i.priority === 'low');
  
  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <details>
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
          Additional Recommendations ({insights.length})
        </summary>
        <div className="mt-3 space-y-3">
          {/* High priority */}
          {highPriority.length > 0 && (
            <div className="space-y-2">
              {highPriority.map((insight) => (
                <InsightItem key={insight.id} insight={insight} />
              ))}
            </div>
          )}
          
          {/* Medium priority */}
          {mediumPriority.length > 0 && (
            <div className="space-y-2">
              {mediumPriority.map((insight) => (
                <InsightItem key={insight.id} insight={insight} />
              ))}
            </div>
          )}
          
          {/* Low priority */}
          {lowPriority.length > 0 && (
            <div className="space-y-2">
              {lowPriority.map((insight) => (
                <InsightItem key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

/**
 * Individual insight item
 */
function InsightItem({ insight }: { insight: ExtractedInsight }) {
  const borderColor = {
    high: 'border-orange-400',
    medium: 'border-blue-300',
    low: 'border-gray-300 dark:border-gray-600',
  }[insight.priority] || 'border-gray-300';
  
  return (
    <div className={`text-sm text-gray-700 dark:text-gray-300 pl-4 border-l-2 ${borderColor} py-2`}>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{insight.message}</ReactMarkdown>
      </div>
    </div>
  );
}
