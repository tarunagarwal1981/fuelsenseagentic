'use client';

import dynamic from 'next/dynamic';
import {
  InformationalResponseCard,
  ExecutiveDecisionCard,
  ValidationResultCard,
  ComparisonResultCard,
  PriorityCard,
  RiskAlertCard,
} from './cards';
import { 
  Accordion, 
  AccordionItem, 
  AccordionTrigger, 
  AccordionContent 
} from '@/components/ui/accordion';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Info, 
  Ship, 
  CheckCircle, 
  GitCompare,
  Map as MapIcon,
  Fuel,
  CloudRain,
  Route as RouteIcon,
  Shield
} from 'lucide-react';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import portsData from '@/lib/data/ports.json';

// Dynamic import for map (prevents SSR issues with Leaflet)
const MapViewerDynamic = dynamic(
  () => import('./map-viewer').then((mod) => mod.MapViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
        <div className="text-center">
          <MapIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface BunkerResponseViewerProps {
  state: MultiAgentState;
}

// ============================================================================
// PORT LOOKUP HELPER
// ============================================================================

interface PortDetails {
  port_code: string;
  name: string;
  country: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

function getPortDetails(portCode: string): PortDetails | null {
  const port = (portsData as any[]).find(
    (p) => p.port_code === portCode || p.port_code === portCode.toUpperCase()
  );
  
  if (!port) return null;

  // Support both ports.json format (coordinates: { lat, lon }) and legacy (latitude, longitude)
  const lat = port.coordinates?.lat ?? port.latitude;
  const lon = port.coordinates?.lon ?? port.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return null;
  }

  return {
    port_code: port.port_code,
    name: port.port_name ?? port.name ?? portCode,
    country: port.country ?? '',
    coordinates: { lat, lon },
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BunkerResponseViewer({ state }: BunkerResponseViewerProps) {
  const hasRoute = !!state.route_data;
  const synthesis = state.synthesized_insights;
  const queryType = synthesis?.query_type || 'decision-required';
  
  // Get port details for map: use ports.json when available, else use route_data resolved names/coordinates (e.g. WPI_*)
  const originPort = hasRoute && state.route_data?.origin_port_code
    ? (getPortDetails(state.route_data.origin_port_code) ??
        (state.route_data.origin_coordinates
          ? {
              port_code: state.route_data.origin_port_code,
              name: state.route_data.origin_port_name ?? state.route_data.origin_port_code,
              country: '',
              coordinates: state.route_data.origin_coordinates,
            }
          : null))
    : null;
  const destinationPort = hasRoute && state.route_data?.destination_port_code
    ? (getPortDetails(state.route_data.destination_port_code) ??
        (state.route_data.destination_coordinates
          ? {
              port_code: state.route_data.destination_port_code,
              name: state.route_data.destination_port_name ?? state.route_data.destination_port_code,
              country: '',
              coordinates: state.route_data.destination_coordinates,
            }
          : null))
    : null;
  
  // Prepare bunker ports with coordinates (FoundPort format: { port, distance_from_route_nm } or flat)
  const bunkerPortsWithCoords = (state.bunker_ports || [])
    .map((item: any) => {
      const port = item.port ?? item;
      const code = port.port_code ?? item.port_code;
      const portDetails = code ? getPortDetails(code) : null;
      const coords = port.coordinates ?? item.coordinates ?? portDetails?.coordinates;
      if (!portDetails && !coords) return null;
      return {
        ...(portDetails || {}),
        ...port,
        port_code: code,
        name: port.name ?? portDetails?.name ?? item.port_name ?? code,
        port_name: port.name ?? portDetails?.name ?? item.port_name ?? code,
        coordinates: coords ?? portDetails?.coordinates,
        distance_from_route_nm: item.distance_from_route_nm ?? port.distance_from_route_nm,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.coordinates);
  
  return (
    <div className="space-y-6">
      {/* ===== TIER 0: ROUTE MAP ===== */}
      {hasRoute && originPort && destinationPort && (
        <Card className="overflow-hidden">
          <MapViewerDynamic
            route={state.route_data}
            originPort={originPort}
            destinationPort={destinationPort}
            bunkerPorts={bunkerPortsWithCoords}
            mapOverlays={state.formatted_response?.mapOverlays}
          />
          
          {/* Critical alert overlay */}
          {synthesis?.critical_risks?.[0]?.severity === 'critical' && (
            <Alert variant="destructive" className="m-4 mt-0">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Critical Alert</AlertTitle>
              <AlertDescription>
                {synthesis.critical_risks[0].risk}
              </AlertDescription>
            </Alert>
          )}
        </Card>
      )}
      
      {/* ===== TIER 1: PRIMARY RESPONSE ===== */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            {getQueryTypeIcon(queryType)}
            {getQueryTypeTitle(queryType)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderPrimaryResponse(queryType, synthesis, state)}
        </CardContent>
      </Card>
      
      {/* ===== TIER 2: STRATEGIC PRIORITIES ===== */}
      {shouldShowPriorities(queryType, synthesis) && synthesis?.strategic_priorities && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Ship className="h-5 w-5 text-blue-600" />
            Strategic Priorities
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {synthesis.strategic_priorities.slice(0, 3).map((priority, idx) => (
              <PriorityCard key={idx} priority={priority} />
            ))}
          </div>
        </div>
      )}
      
      {/* ===== TIER 2: CRITICAL RISKS ===== */}
      {synthesis?.critical_risks && synthesis.critical_risks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk Alerts
          </h3>
          <div className="space-y-3">
            {synthesis.critical_risks.map((risk, idx) => (
              <RiskAlertCard key={idx} risk={risk} />
            ))}
          </div>
        </div>
      )}
      
      {/* ===== TIER 3: EXPANDABLE DETAILS ===== */}
      {hasDetailsToShow(synthesis, state) && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-gray-600" />
            Additional Details
          </h3>
          <Accordion type="multiple" className="space-y-2">
            
            {/* Multi-Port Breakdown */}
            {synthesis?.details_to_surface?.show_multi_port_analysis && 
             state.multi_bunker_plan && (
              <AccordionItem value="multi-port" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-4 w-4 text-purple-600" />
                    <span>Multi-Port Breakdown</span>
                    <Badge variant="secondary" className="ml-2">
                      Recommended Strategy
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* TODO: Add MultiPortBreakdownTable component */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs overflow-auto max-h-64">
                      {JSON.stringify(state.multi_bunker_plan, null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {/* Alternative Options (recommendations excluding best option) */}
            {synthesis?.details_to_surface?.show_alternatives && 
             state.bunker_analysis?.recommendations && 
             state.bunker_analysis.recommendations.length > 1 && (
              <AccordionItem value="alternatives" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-blue-600" />
                    <span>Alternative Options</span>
                    <Badge variant="outline" className="ml-2">
                      Top {Math.min(2, state.bunker_analysis.recommendations.length - 1)}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* TODO: Add AlternativesGrid component */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs overflow-auto max-h-64">
                      {JSON.stringify(state.bunker_analysis.recommendations.slice(1, 3), null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {/* ROB Waypoint Tracking */}
            {synthesis?.details_to_surface?.show_rob_waypoints && 
             state.rob_waypoints && (
              <AccordionItem value="rob-tracking" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-orange-600" />
                    <span>ROB Waypoint Tracking</span>
                    {state.rob_safety_status && !state.rob_safety_status.overall_safe && (
                      <Badge variant="destructive" className="ml-2">
                        Tight Margins
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* TODO: Add ROBTimelineTable component */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs overflow-auto max-h-64">
                      {JSON.stringify(state.rob_waypoints, null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {/* Weather Impact Details */}
            {synthesis?.details_to_surface?.show_weather_details && 
             state.weather_forecast && (
              <AccordionItem value="weather" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CloudRain className="h-4 w-4 text-sky-600" />
                    <span>Weather Impact Details</span>
                    {state.weather_consumption && (
                      <Badge variant="outline" className="ml-2">
                        +{state.weather_consumption.consumption_increase_percent.toFixed(1)}% consumption
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* TODO: Add WeatherImpactSummary component */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs overflow-auto max-h-64">
                      {JSON.stringify(state.weather_forecast, null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {/* ECA Compliance Details */}
            {synthesis?.details_to_surface?.show_eca_details && 
             state.compliance_data?.eca_zones && (
              <AccordionItem value="eca" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span>ECA Compliance Details</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* TODO: Add ECATimelineView component */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs overflow-auto max-h-64">
                      {JSON.stringify(state.compliance_data.eca_zones, null, 2)}
                    </pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
          </Accordion>
        </div>
      )}
      
      {/* ===== FILTERING METADATA (Debug/Dev only) ===== */}
      {process.env.NODE_ENV === 'development' && synthesis?.synthesis_metadata && (
        <details className="text-xs text-gray-500 border-t pt-4 mt-6">
          <summary className="cursor-pointer hover:text-gray-700">
            Synthesis Metadata (dev only)
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded">
            <p><strong>Query Type:</strong> {queryType}</p>
            <p><strong>Confidence:</strong> {synthesis.synthesis_metadata.confidence_score}</p>
            <p><strong>Agents:</strong> {synthesis.synthesis_metadata.agents_analyzed.join(', ')}</p>
            {synthesis.synthesis_metadata.filtering_rationale && (
              <>
                <p className="mt-2"><strong>Why Surfaced:</strong></p>
                <ul className="list-disc pl-4">
                  {synthesis.synthesis_metadata.filtering_rationale.why_surfaced.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
                <p className="mt-2"><strong>Why Hidden:</strong></p>
                <ul className="list-disc pl-4">
                  {synthesis.synthesis_metadata.filtering_rationale.why_hidden.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getQueryTypeIcon(queryType: string) {
  switch (queryType) {
    case 'informational': 
      return <Info className="h-5 w-5 text-blue-600" />;
    case 'decision-required': 
      return <Ship className="h-5 w-5 text-green-600" />;
    case 'validation': 
      return <CheckCircle className="h-5 w-5 text-purple-600" />;
    case 'comparison': 
      return <GitCompare className="h-5 w-5 text-orange-600" />;
    default: 
      return <Ship className="h-5 w-5 text-gray-600" />;
  }
}

function getQueryTypeTitle(queryType: string): string {
  switch (queryType) {
    case 'informational': 
      return 'Information';
    case 'decision-required': 
      return 'Bunker Recommendation';
    case 'validation': 
      return 'Feasibility Check';
    case 'comparison': 
      return 'Option Comparison';
    default: 
      return 'Result';
  }
}

function renderPrimaryResponse(
  queryType: string, 
  synthesis: MultiAgentState['synthesized_insights'],
  state: MultiAgentState
) {
  if (!synthesis?.response) {
    // Fallback to basic recommendation
    if (state.final_recommendation) {
      return (
        <div className="text-gray-700">
          <p>{state.final_recommendation}</p>
        </div>
      );
    }
    return (
      <div className="text-gray-500 italic">
        No synthesis available. Processing your request...
      </div>
    );
  }
  
  switch (queryType) {
    case 'informational':
      return synthesis.response.informational ? (
        <InformationalResponseCard data={synthesis.response.informational} />
      ) : null;
      
    case 'decision-required':
      return synthesis.response.decision ? (
        <ExecutiveDecisionCard decision={synthesis.response.decision} />
      ) : null;
      
    case 'validation':
      return synthesis.response.validation ? (
        <ValidationResultCard validation={synthesis.response.validation} />
      ) : null;
      
    case 'comparison':
      return synthesis.response.comparison ? (
        <ComparisonResultCard comparison={synthesis.response.comparison} />
      ) : null;
      
    default:
      return (
        <div className="text-gray-500">
          Unknown query type: {queryType}
        </div>
      );
  }
}

function shouldShowPriorities(
  queryType: string, 
  synthesis: MultiAgentState['synthesized_insights']
): boolean {
  if (!synthesis?.strategic_priorities || synthesis.strategic_priorities.length === 0) {
    return false;
  }
  
  // Show for decision-required queries
  if (queryType === 'decision-required') return true;
  
  // Show for validation queries if result is not_feasible or risky
  if (queryType === 'validation') {
    const result = synthesis.response?.validation?.result;
    return result === 'not_feasible' || result === 'risky';
  }
  
  // Don't show for informational or comparison
  return false;
}

function hasDetailsToShow(
  synthesis: MultiAgentState['synthesized_insights'],
  state: MultiAgentState
): boolean {
  if (!synthesis?.details_to_surface) return false;
  
  const flags = synthesis.details_to_surface;
  
  // Check each flag AND verify data exists
  return (
    (flags.show_multi_port_analysis && !!state.multi_bunker_plan) ||
    (flags.show_alternatives && (state.bunker_analysis?.recommendations?.length ?? 0) > 1) ||
    (flags.show_rob_waypoints && !!state.rob_waypoints) ||
    (flags.show_weather_details && !!state.weather_forecast) ||
    (flags.show_eca_details && !!state.compliance_data?.eca_zones)
  );
}
