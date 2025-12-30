'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertCircle, 
  CheckCircle2, 
  MapPin, 
  Fuel, 
  DollarSign, 
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check
} from 'lucide-react';
import type { ComplianceCardData } from '@/lib/formatters/response-formatter';

export function ComplianceCard({ data }: { data: ComplianceCardData | null }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!data) {
    return null; // Graceful degradation
  }

  // NO ECA variant
  if (!data.hasECAZones) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">No Regulatory Restrictions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            {data.noECAMessage?.description}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {data.noECAMessage?.fuelType}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ECA DETECTED variant
  const { ecaDetails } = data;
  if (!ecaDetails) {
    return null;
  }

  const isWarning = data.severity === 'warning';
  const cardClassName = isWarning 
    ? 'border-red-200 bg-red-50/50' 
    : 'border-orange-200 bg-orange-50/50';
  const iconClassName = isWarning ? 'h-5 w-5 text-red-600' : 'h-5 w-5 text-orange-600';
  const badgeClassName = isWarning ? 'bg-red-100' : 'bg-orange-100';
  
  return (
    <Card className={cardClassName}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className={iconClassName} />
            <CardTitle className="text-lg">ECA Compliance Required</CardTitle>
          </div>
          <Badge variant="secondary" className={badgeClassName}>
            {ecaDetails.zonesCount} Zone{ecaDetails.zonesCount > 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Fuel className="h-3 w-3" />
              MGO Required
            </div>
            <div className="text-lg font-semibold">
              {ecaDetails.totalMGOMT.toFixed(0)} MT
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <DollarSign className="h-3 w-3" />
              Compliance Cost
            </div>
            <div className="text-lg font-semibold">
              ${ecaDetails.complianceCostUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              Switching Points
            </div>
            <div className="text-lg font-semibold">
              {ecaDetails.switchingPoints.length}
            </div>
          </div>
        </div>

        {/* Zone Details */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">ECA Zones:</h4>
          {ecaDetails.zones.map((zone, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 space-y-1">
              <div className="flex items-start justify-between">
                <div className="font-medium text-sm">{zone.name}</div>
                <Badge variant="outline" className="text-xs">
                  {zone.percentOfRoute.toFixed(1)}% of route
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                <div>
                  <span className="text-gray-500">Distance:</span> {zone.distanceNM.toFixed(1)} nm
                </div>
                <div>
                  <span className="text-gray-500">Duration:</span> {zone.durationHours.toFixed(1)} hrs
                </div>
                <div>
                  <span className="text-gray-500">MGO:</span> {zone.mgoRequiredMT.toFixed(0)} MT
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Switching Points (Expandable) */}
        {ecaDetails.switchingPoints.length > 0 && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full justify-between px-0 hover:bg-transparent"
            >
              <h4 className="text-sm font-semibold text-gray-700">
                🔄 Fuel Switching Points
              </h4>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            
            {expanded && (
              <div className="space-y-2">
                {ecaDetails.switchingPoints.map((point, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢'}
                        </span>
                        <span className="font-medium text-sm">
                          {point.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const textToCopy = `${point.action} at ${point.timeFromStartFormatted} (${point.locationFormatted})`;
                          navigator.clipboard.writeText(textToCopy).then(() => {
                            setCopiedIndex(idx);
                            setTimeout(() => setCopiedIndex(null), 2000);
                          }).catch((err) => {
                            console.error('Failed to copy:', err);
                          });
                        }}
                        className="h-8 w-8 p-0"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-500">Time:</span> {point.timeFromStartFormatted} from departure
                      </div>
                      <div>
                        <span className="text-gray-500">Location:</span> {point.locationFormatted}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {ecaDetails.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
            <h4 className="text-sm font-semibold text-yellow-800 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Warnings
            </h4>
            {ecaDetails.warnings.map((warning, idx) => (
              <p key={idx} className="text-xs text-yellow-700">• {warning}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

