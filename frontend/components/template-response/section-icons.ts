/**
 * Section Icons & Styling
 * 
 * Provides consistent icons and styling for template response sections.
 */

// ============================================================================
// Section Icon Mappings
// ============================================================================

export const SECTION_ICONS: Record<string, string> = {
  // Bunker Planning - Tier 1
  'primary_recommendation': '🎯',
  'critical_safety_alert': '🚨',
  'cost_summary': '💰',
  'alternative_port': '🔄',
  
  // Bunker Planning - Tier 2
  'why_this_recommendation': '📊',
  'rob_tracking_summary': '⛽',
  'eca_compliance_summary': '⚖️',
  
  // Bunker Planning - Tier 3
  'complete_rob_tracking': '⛽',
  'all_port_options': '📍',
  'eca_fuel_switching_timeline': '🔄',
  'weather_impact_details': '🌊',
  
  // Route Only
  'route_summary': '📍',
  'route_waypoints': '🗺️',
  
  // CII Rating
  'cii_rating_card': '📊',
  'top_recommendations': '🎯',
  'rating_breakdown': '📈',
  'optimization_strategies': '🎯',
  'calculation_methodology': '🔢',
  
  // Hull Performance
  'hull_condition': '🚢',
  'fouling_impact': '📉',
  'cleaning_recommendation': '🧽',
  'roi_analysis': '💰',
};

/**
 * Get the icon for a section by its ID
 */
export function getSectionIcon(sectionId: string): string {
  return SECTION_ICONS[sectionId] || '📄';
}

/**
 * Strip leading emoji and whitespace from a title
 * Handles various emoji patterns including compound emojis
 */
export function stripEmojiPrefix(title: string): string {
  // Match common emoji patterns at the start of the string
  // This regex handles single emojis, emoji with variation selectors, and compound emojis
  return title.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]+\s*/u, '');
}

// ============================================================================
// Tier-Specific Styling
// ============================================================================

export const TIER_STYLES = {
  1: {
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    hover: 'hover:shadow-md',
    text: 'text-gray-900 dark:text-gray-100',
  },
  2: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
    text: 'text-gray-900 dark:text-gray-100',
  },
  3: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    hover: 'hover:bg-gray-100 dark:hover:bg-gray-700/50',
    text: 'text-gray-900 dark:text-gray-100',
  },
} as const;

export type TierNumber = keyof typeof TIER_STYLES;
