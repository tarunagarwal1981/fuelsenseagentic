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
      <div className="prose prose-sm max-w-none dark:prose-invert font-sans text-xs text-gray-900 dark:text-gray-100 [&_*]:font-sans [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs">
        <ReactMarkdown>{response.text || ''}</ReactMarkdown>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 font-sans text-xs text-gray-900 dark:text-gray-100">
      {/* Dev metadata */}
      {process.env.NODE_ENV === 'development' && response.template_metadata && (
        <div className="text-xs text-gray-500 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-600 pl-3 font-sans">
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
        <details className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 font-sans">
          <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium font-sans">
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
          className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg font-sans text-sm"
        >
          <div className="prose prose-sm max-w-none dark:prose-invert font-sans [&_*]:font-sans [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs">
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
    <div className="p-[1px] rounded-xl bg-gradient-to-r from-teal-200/90 via-teal-100/80 to-green-200/90 dark:from-teal-700/40 dark:via-teal-800/30 dark:to-green-700/40">
      <div className={`${styles.bg} rounded-xl border-0 shadow-sm p-4 ${styles.hover} transition-all duration-200 font-sans`}>
        <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${styles.text} font-sans`}>
          <span className="text-base">{icon}</span>
          <span>{cleanTitle}</span>
        </h3>
        <div className="prose prose-sm max-w-none dark:prose-invert font-sans [&_*]:font-sans [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs [&_strong]:font-bold">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      {section.truncated && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-sans">
          * Content truncated to {section.word_count} words
        </p>
      )}
      </div>
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
    <div className="p-[1px] rounded-xl bg-gradient-to-r from-teal-200/90 via-teal-100/80 to-green-200/90 dark:from-teal-700/40 dark:via-teal-800/30 dark:to-green-700/40">
      <div className={`rounded-xl ${styles.bg} border-0 transition-all duration-200 font-sans overflow-hidden`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full px-4 py-2.5 text-left flex items-center justify-between ${styles.hover} transition-colors font-sans`}
        >
          <span className={`font-medium text-xs flex items-center gap-2 ${styles.text} font-sans`}>
            <span className="text-sm">{icon}</span>
            <span>{cleanTitle}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
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
          <div className="px-4 pb-4 pt-2 prose prose-sm max-w-none dark:prose-invert font-sans animate-fadeIn [&_*]:font-sans [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs">
            <ReactMarkdown>{section.content}</ReactMarkdown>
          </div>
        )}
      </div>
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
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 font-sans">
      <details>
        <summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-sans">
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
    critical: 'border-red-500',
    high: 'border-orange-400',
    medium: 'border-blue-300',
    low: 'border-gray-300 dark:border-gray-600',
  }[insight.priority] || 'border-gray-300';
  
  return (
    <div className={`text-xs text-gray-700 dark:text-gray-300 pl-4 border-l-2 ${borderColor} py-2 font-sans`}>
      <div className="prose prose-sm max-w-none dark:prose-invert font-sans [&_*]:font-sans [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs">
        <ReactMarkdown>{insight.message}</ReactMarkdown>
      </div>
    </div>
  );
}
