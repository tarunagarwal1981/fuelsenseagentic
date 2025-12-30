'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Cloud, 
  CloudRain, 
  Wind, 
  Waves, 
  Eye, 
  AlertTriangle, 
  CheckCircle2 
} from 'lucide-react';
import type { WeatherCardData } from '@/lib/formatters/response-formatter';

export function WeatherCard({ data }: { data: WeatherCardData | null }) {
  if (!data || !data.showCard) {
    return null; // Don't show if not needed
  }

  const unsafePorts = data.portWeather.filter(p => !p.isSafe);
  const hasWeatherIssues = unsafePorts.length > 0 || data.routeWeather?.hasAdverseConditions;

  const cardClassName = hasWeatherIssues 
    ? "border-yellow-200 bg-yellow-50/50" 
    : "border-blue-200 bg-blue-50/50";
  const iconClassName = hasWeatherIssues 
    ? 'h-5 w-5 text-yellow-600' 
    : 'h-5 w-5 text-blue-600';

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cloud className={iconClassName} />
          <CardTitle className="text-lg">Weather Analysis</CardTitle>
          {hasWeatherIssues && (
            <Badge variant="secondary" className="bg-yellow-100">
              {unsafePorts.length} Issue{unsafePorts.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Route Weather Impact */}
        {data.routeWeather && (
          <div className="bg-white rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Route Conditions:</h4>
            <p className="text-sm text-gray-600">{data.routeWeather.summary}</p>
            {data.routeWeather.hasAdverseConditions && (
              <div className="flex items-center gap-2 text-sm text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <span>Additional fuel required: {data.routeWeather.fuelAdjustmentMT.toFixed(0)} MT</span>
              </div>
            )}
          </div>
        )}

        {/* Port Weather Status */}
        {data.portWeather.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Port Weather Safety:</h4>
            <div className="space-y-2">
              {data.portWeather.map((port, idx) => (
                <div 
                  key={idx} 
                  className={`rounded-lg p-3 ${
                    port.isSafe ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {port.isSafe ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium text-sm">{port.portName}</span>
                      {port.portCode && (
                        <span className="text-xs text-gray-500">({port.portCode})</span>
                      )}
                    </div>
                    <Badge 
                      variant={port.isSafe ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {port.isSafe ? 'Safe' : 'Unsafe'}
                    </Badge>
                  </div>

                  {/* Conditions */}
                  {port.conditions && (
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <Wind className="h-3 w-3" />
                        {port.conditions.windSpeedKnots.toFixed(0)} kts
                      </div>
                      <div className="flex items-center gap-1">
                        <Waves className="h-3 w-3" />
                        {port.conditions.waveHeightM.toFixed(1)} m
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {port.conditions.visibilityKm.toFixed(1)} km
                      </div>
                    </div>
                  )}

                  {/* Risk Factors */}
                  {port.riskFactors.length > 0 && (
                    <div className="space-y-1">
                      {port.riskFactors.map((risk, rIdx) => (
                        <div key={rIdx} className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {risk}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Port Weather Data */}
        {data.portWeather.length === 0 && !data.routeWeather && (
          <p className="text-sm text-gray-500 text-center py-4">
            No weather data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

