'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Ship, 
  MapPin, 
  TrendingUp, 
  CloudRain,
  Anchor,
  Trophy
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { ResultsTable } from './results-table';
import portsData from '@/lib/data/ports.json';

// Dynamic import for map (prevents SSR issues with Leaflet)
const MapViewerDynamic = dynamic(
  () => import('./map-viewer').then((mod) => mod.MapViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

import type { MapOverlaysData } from '@/lib/formatters/response-formatter';

interface AnalysisDisplayProps {
  data: {
    route?: any;
    ports?: any[];
    prices?: any;
    analysis?: any;
    weather?: any;
  };
  mapOverlays?: MapOverlaysData | null;
}

// Helper function to get port details
const getPortDetails = (portCode: string) => {
  return (portsData as any[]).find((p: any) => p.port_code === portCode);
};

export function MultiAgentAnalysisDisplay({ data, mapOverlays }: AnalysisDisplayProps) {
  const { route, ports, prices, analysis, weather } = data;

  if (!route && !ports && !analysis) {
    return null;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Route Information */}
      {route && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Ship className="h-5 w-5 text-blue-600" />
              Route Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Origin</p>
                <p className="font-semibold text-gray-900">{route.origin_port_name || route.origin_port_code || route.origin}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Destination</p>
                <p className="font-semibold text-gray-900">{route.destination_port_name || route.destination_port_code || route.destination}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Distance</p>
                <p className="font-semibold text-gray-900">{route.distance_nm?.toFixed(0) || 'N/A'} nm</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estimated Duration</p>
                <p className="font-semibold text-gray-900">
                  {route.estimated_hours 
                    ? `${Math.floor(route.estimated_hours / 24)}d ${Math.round(route.estimated_hours % 24)}h`
                    : 'N/A'}
                </p>
              </div>
            </div>
            
            {/* Map Visualization: use ports.json when available, else route_data resolved coords (e.g. WPI_*) */}
            {route.waypoints && route.origin_port_code && route.destination_port_code && (() => {
              const originPort = getPortDetails(route.origin_port_code) ?? (route.origin_coordinates
                ? { port_code: route.origin_port_code, name: route.origin_port_name ?? route.origin_port_code, country: '', coordinates: route.origin_coordinates }
                : null);
              const destinationPort = getPortDetails(route.destination_port_code) ?? (route.destination_coordinates
                ? { port_code: route.destination_port_code, name: route.destination_port_name ?? route.destination_port_code, country: '', coordinates: route.destination_coordinates }
                : null);
              if (originPort && destinationPort) {
                return (
                  <div className="mt-4">
                    <MapViewerDynamic 
                      route={route}
                      originPort={originPort}
                      destinationPort={destinationPort}
                      bunkerPorts={analysis?.recommendations?.map((rec: any) => {
                        const portDetails = getPortDetails(rec.port_code);
                        return portDetails ? { ...portDetails, ...rec } : null;
                      }).filter((p: any) => p !== null) || []}
                      mapOverlays={mapOverlays}
                    />
                  </div>
                );
              }
              return null;
            })()}
          </CardContent>
        </Card>
      )}

      {/* Weather Analysis */}
      {weather && (weather.weather_consumption || weather.weather_forecast) && (
        <Card className="bg-cyan-50 border-cyan-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <CloudRain className="h-5 w-5 text-cyan-600" />
              Weather Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Forecast Points</p>
                <p className="font-semibold text-gray-900">{weather.weather_forecast?.length || weather.weather_consumption?.forecast_points || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Consumption Increase</p>
                <p className="font-semibold text-gray-900">
                  {weather.weather_consumption?.consumption_increase_percent?.toFixed(2) || 
                   weather.increase_percent?.toFixed(2) || '0.00'}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Weather Impact</p>
                <Badge variant={
                  (weather.weather_consumption?.consumption_increase_percent || weather.increase_percent || 0) > 10 
                    ? 'destructive' 
                    : 'default'
                } className={
                  (weather.weather_consumption?.consumption_increase_percent || weather.increase_percent || 0) > 10
                    ? 'bg-red-500 text-white'
                    : 'bg-yellow-500 text-white'
                }>
                  {(weather.weather_consumption?.consumption_increase_percent || weather.increase_percent || 0) > 10 
                    ? 'High' 
                    : 'Moderate'}
                </Badge>
              </div>
              {(weather.weather_consumption?.additional_fuel_needed_mt || weather.additional_fuel_mt) && (
                <div className="col-span-3">
                  <p className="text-sm text-gray-500">Additional Fuel Needed</p>
                  <p className="font-semibold text-orange-600">
                    +{(weather.weather_consumption?.additional_fuel_needed_mt || weather.additional_fuel_mt)?.toFixed(2) || '0.00'} MT
                  </p>
                </div>
              )}
            </div>
            {weather.alerts_count > 0 && (
              <div className="mt-3 p-2 bg-yellow-100 rounded text-sm text-yellow-800">
                ⚠️ {weather.alerts_count} weather alert(s) detected
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bunker Ports Found */}
      {ports && ports.length > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Anchor className="h-5 w-5 text-blue-600" />
              Bunker Ports Found ({ports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ports.slice(0, 5).map((port: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-900">
                      {port.port?.name || port.name || port.port_name || port.port_code}
                    </span>
                    {port.port_code && (
                      <span className="text-xs text-gray-500">({port.port_code})</span>
                    )}
                  </div>
                  <Badge variant="outline" className="border-blue-200 text-blue-700">
                    {port.distance_from_route_nm?.toFixed(0) || port.deviation_nm?.toFixed(0) || 0} nm
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bunker Analysis Results */}
      {analysis && analysis.recommendations && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Bunker Analysis & Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Best Option Highlight */}
            {analysis.best_option && (
              <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-5 w-5 text-green-600" />
                      <h4 className="font-semibold text-lg text-gray-900">
                        Best Option: {analysis.best_option.port_name || analysis.best_option.port_code}
                      </h4>
                      <Badge className="bg-green-500 text-white">Recommended</Badge>
                    </div>
                    {analysis.best_option.port_country && (
                      <p className="text-sm text-gray-500 mb-2">
                        {analysis.best_option.port_country}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Total Cost</p>
                        <p className="text-xl font-bold text-green-600">
                          ${(analysis.best_option.total_cost || analysis.best_option.total_cost_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Savings vs Worst</p>
                        <p className="text-xl font-bold text-gray-900">
                          ${(analysis.max_savings_usd || analysis.max_savings || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* All Recommendations Table */}
            <ResultsTable 
              recommendations={analysis.recommendations.map((rec: any) => ({
                port_code: rec.port_code,
                port_name: rec.port_name || rec.port_code,
                rank: rec.rank || 0,
                fuel_price_per_mt: rec.fuel_price_per_mt || (rec.fuel_cost || rec.fuel_cost_usd || 0) / (rec.fuel_quantity_mt || 1000),
                fuel_cost: rec.fuel_cost || rec.fuel_cost_usd || 0,
                deviation_nm: rec.deviation_nm || rec.distance_from_route_nm || 0,
                deviation_hours: rec.deviation_hours || 0,
                deviation_days: rec.deviation_days || 0,
                deviation_fuel_consumption_mt: rec.deviation_fuel_consumption_mt || 0,
                deviation_fuel_cost: rec.deviation_fuel_cost || rec.deviation_cost_usd || 0,
                total_cost: rec.total_cost || rec.total_cost_usd || 0,
                savings_vs_most_expensive: rec.savings_vs_most_expensive || rec.savings_vs_worst_usd || 0,
                savings_percentage: rec.savings_percentage || 0,
                data_freshness_hours: rec.data_freshness_hours || 0,
                is_price_stale: rec.is_price_stale || false,
              }))}
              fuelQuantity={1000}
              fuelType="VLSFO"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

