'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { RichMap } from './rich-map';
import { CostComparison } from './ui/cost-comparison';
import { ComplianceCard } from './compliance-card';
import { VoyageTimeline } from './voyage-timeline';
import { WeatherCard } from './weather-card';
import { EnhancedBunkerTable } from './enhanced-bunker-table';
import { SpeedConsumptionChart } from './charts/speed-consumption-chart';
import type { ComplianceCardData, TimelineData } from '@/lib/formatters/component-adapter-types';
import { formatBunkerTable } from '@/lib/formatters/format-bunker-table';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// Component registry - maps component names to actual React components
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  RichMap,
  RouteMap: RichMap, // backward compat alias
  CostComparison,
  ECAComplianceCard: ComplianceCard,
  ComplianceCard,
  WeatherTimeline: VoyageTimeline,
  VoyageTimeline,
  WeatherCard,
  EnhancedBunkerTable,
  SpeedConsumptionChart,
};

interface ComponentManifest {
  id: string;
  component: string;
  props: Record<string, unknown>;
  tier: number;
  priority: number;
  display_order?: number;
}

interface HybridResponseRendererProps {
  response: {
    type: 'text_only' | 'hybrid';
    text?: string;
    content?: string;
    components?: ComponentManifest[];
    query_type?: string;
    mapOverlays?: unknown;
  };
  className?: string;
}

/**
 * Adapt registry props to RichMap component props (rich map with bunker ports, ECA overlays)
 */
function adaptRichMapProps(
  props: Record<string, unknown>,
  mapOverlays?: unknown
) {
  return {
    route: props.route,
    analysis: props.analysis,
    bunkerPorts: props.bunker_ports,
    mapOverlays: mapOverlays ?? null,
  };
}

/**
 * Adapt registry props to CostComparison component props
 */
function adaptCostComparisonProps(props: Record<string, unknown>) {
  const options = (props.options as unknown[]) ?? [];
  const recommendation = props.recommendation;
  return {
    data: {
      ports: options,
      recommendations: options,
      best_option: recommendation ?? options[0],
    },
  };
}

/**
 * Adapt registry props to ComplianceCard (ECAComplianceCard) component props
 */
function adaptECAComplianceProps(props: Record<string, unknown>) {
  const ecaSegments = (props.ecaSegments as unknown[]) ?? [];
  const switchingPoints = (props.switchingPoints as unknown[]) ?? [];

  if (!ecaSegments.length) return { data: null };

  const complianceData: ComplianceCardData = {
    hasECAZones: true,
    severity: 'info',
    ecaDetails: {
      zonesCount: ecaSegments.length,
      zones: ecaSegments.map((seg: any, i: number) => ({
        name: seg.name ?? `Zone ${i + 1}`,
        code: seg.code ?? '',
        distanceNM: seg.distance_nm ?? ((seg.end_nm ?? 0) - (seg.start_nm ?? 0)),
        durationHours: seg.duration_hours ?? 0,
        percentOfRoute: seg.percent_of_route ?? 0,
        mgoRequiredMT: seg.mgo_required_mt ?? 0,
      })),
      totalMGOMT: 0,
      complianceCostUSD: 0,
      switchingPoints: switchingPoints.map((sp: any) => ({
        action: sp.action ?? 'SWITCH_TO_MGO',
        timeFromStartHours: sp.time_from_start_hours ?? 0,
        timeFromStartFormatted: sp.time_from_start_formatted ?? '',
        location: sp.location ?? { lat: 0, lon: 0 },
        locationFormatted: sp.location_formatted ?? '',
      })),
      warnings: (props.violations as string[]) ?? [],
    },
  };

  return { data: complianceData };
}

/**
 * Adapt registry props to VoyageTimeline (WeatherTimeline) component props
 */
function adaptWeatherTimelineProps(props: Record<string, unknown>) {
  const forecast = props.forecast as Record<string, unknown> | undefined;
  const vesselTimeline = props.vesselTimeline as Array<Record<string, unknown>> | undefined;

  const timeline = forecast?.timeline ?? vesselTimeline;
  if (!timeline || !Array.isArray(timeline)) return { data: null };

  const events: TimelineData['events'] = timeline.map((entry: any, i: number) => ({
    hourFromStart: entry.hour_from_start ?? entry.hour ?? i,
    hourFormatted: entry.hour_formatted ?? `${entry.hour ?? i}h`,
    type: (entry.type ?? 'ARRIVAL') as 'DEPARTURE' | 'BUNKER' | 'SWITCH_FUEL' | 'ARRIVAL',
    icon: entry.icon ?? '📍',
    title: entry.title ?? entry.description ?? `Waypoint ${i + 1}`,
    description: entry.description ?? '',
    location: entry.location,
    locationFormatted: entry.location_formatted,
    actionRequired: entry.action_required ?? false,
  }));

  return { data: { events } };
}

/**
 * Adapt registry props to EnhancedBunkerTable component props
 */
function adaptEnhancedBunkerTableProps(props: Record<string, unknown>) {
  const bunkerAnalysis = props.bunkerAnalysis;
  const complianceData = props.complianceData;
  if (!bunkerAnalysis) return { data: null };

  const partialState = {
    bunker_analysis: bunkerAnalysis,
    compliance_data: complianceData,
  } as MultiAgentState;
  const data = formatBunkerTable(partialState);
  const density = props.density as 'default' | 'compact' | undefined;
  return { data, ...(density && { density }) };
}

/**
 * Get adapted props for a component based on its type
 */
function getAdaptedProps(
  componentName: string,
  props: Record<string, unknown>,
  response?: { mapOverlays?: unknown }
) {
  switch (componentName) {
    case 'RichMap':
    case 'RouteMap':
      return adaptRichMapProps(props, response?.mapOverlays);
    case 'CostComparison':
      return adaptCostComparisonProps(props);
    case 'ECAComplianceCard':
    case 'ComplianceCard':
      return adaptECAComplianceProps(props);
    case 'WeatherTimeline':
    case 'VoyageTimeline':
      return adaptWeatherTimelineProps(props);
    case 'EnhancedBunkerTable':
      return adaptEnhancedBunkerTableProps(props);
    default:
      return props;
  }
}

export function HybridResponseRenderer({
  response,
  className = '',
}: HybridResponseRendererProps) {
  if (!response) {
    return (
      <div className="text-muted-foreground text-sm">No response available</div>
    );
  }

  // TEXT-ONLY RESPONSE
  if (response.type === 'text_only') {
    const content = response.content ?? response.text ?? '';
    return (
      <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  // HYBRID RESPONSE: text + components
  const sortedComponents = (response.components ?? []).sort(
    (a, b) => {
      const aOrder = (a as ComponentManifest).display_order;
      const bOrder = (b as ComponentManifest).display_order;
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      return a.tier - b.tier || a.priority - b.priority;
    }
  );

  const isBunkerPlanning = response.query_type === 'bunker_planning';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Intro text: card wrapper for bunker_planning (theme colors), else plain prose */}
      {response.text && (
        isBunkerPlanning ? (
          <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5">
              <div className="prose prose-sm max-w-none dark:prose-invert text-card-foreground [&_strong]:text-foreground [&_p]:text-muted-foreground [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_p:last-child]:text-primary [&_p:last-child]:font-medium [&_p:empty]:hidden">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.text}</ReactMarkdown>
          </div>
        )
      )}

      {/* Dynamic components by tier */}
      {sortedComponents.map((componentDef, index) => {
        const Component = COMPONENT_MAP[componentDef.component];

        if (!Component) {
          return (
            <div
              key={componentDef.id ?? index}
              className="border border-dashed border-yellow-500 p-4 rounded-lg bg-yellow-50/30 dark:bg-yellow-950/20"
            >
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ Component &quot;{componentDef.component}&quot; is not available yet.
              </p>
            </div>
          );
        }

        const adaptedProps = getAdaptedProps(
          componentDef.component,
          componentDef.props,
          response
        );

        return (
          <div
            key={componentDef.id ?? index}
            className={`component-tier-${componentDef.tier} w-full`}
            data-component-id={componentDef.id}
          >
            <Component {...adaptedProps} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Wrapper for backward compatibility with old response format
 */
export function ResponseRenderer({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return (
    <HybridResponseRenderer
      response={{ type: 'text_only', content }}
      className={className}
    />
  );
}
