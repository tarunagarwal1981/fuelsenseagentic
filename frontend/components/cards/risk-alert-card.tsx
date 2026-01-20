'use client';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, XCircle } from 'lucide-react';

interface RiskAlertCardProps {
  risk: {
    risk: string;
    severity: 'critical' | 'high';
    consequence: string;
    mitigation: string;
  };
}

export function RiskAlertCard({ risk }: RiskAlertCardProps) {
  const isCritical = risk.severity === 'critical';
  
  return (
    <Alert 
      variant={isCritical ? 'destructive' : 'default'}
      className={isCritical ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'}
    >
      {isCritical ? (
        <XCircle className="h-5 w-5" />
      ) : (
        <AlertTriangle className="h-5 w-5" />
      )}
      
      <AlertTitle className="font-bold text-base mb-2">
        {risk.risk}
      </AlertTitle>
      
      <AlertDescription className="space-y-2">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">
            Consequence:
          </p>
          <p className="text-sm">{risk.consequence}</p>
        </div>
        
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">
            Mitigation:
          </p>
          <p className="text-sm font-medium">{risk.mitigation}</p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
