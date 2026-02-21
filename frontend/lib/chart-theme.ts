/**
 * Chart colors aligned with design tokens (globals.css --chart-* and --status-*).
 * Use hex values so Recharts/SVG resolve correctly.
 */
export const CHART = {
  /** Primary series (teal) */
  primary: '#219495',
  /** Secondary series / key threshold (orange) */
  secondary: '#F9A82B',
  /** Tertiary / baseline (navy) */
  tertiary: '#072638',
  /** Warning threshold line */
  warning: '#D0B010',
  /** Fill / area shading (teal-200) */
  fill: '#BBE3E5',
  /** Grid lines */
  grid: '#E5E7EA',
  /** Axis labels */
  axisLabel: '#9EA2AE',
  /** Reference line - error */
  referenceError: '#CD1030',
  /** Reference line - warning */
  referenceWarning: '#D0B010',
  /** Success zone fill */
  zoneSuccess: '#00A27D',
  /** Warning zone fill */
  zoneWarning: '#D0B010',
  /** Error zone fill */
  zoneError: '#CD1030',
} as const;
