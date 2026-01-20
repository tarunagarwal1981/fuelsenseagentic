'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ExecutiveDecisionCardProps {
  decision: {
    action: string;
    primary_metric: string;
    risk_level: 'safe' | 'caution' | 'critical';
    confidence: number;
  };
}

export function ExecutiveDecisionCard({ decision }: ExecutiveDecisionCardProps) {
  const getRiskConfig = (level: string) => {
    switch (level) {
      case 'safe':
        return { 
          icon: CheckCircle, 
          color: 'text-green-600', 
          bg: 'bg-green-50',
          border: 'border-green-200',
          label: 'Safe' 
        };
      case 'caution':
        return { 
          icon: AlertTriangle, 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          label: 'Caution' 
        };
      case 'critical':
        return { 
          icon: XCircle, 
          color: 'text-red-600', 
          bg: 'bg-red-50',
          border: 'border-red-200',
          label: 'Critical' 
        };
      default:
        return { 
          icon: AlertTriangle, 
          color: 'text-gray-600', 
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          label: 'Unknown' 
        };
    }
  };
  
  const config = getRiskConfig(decision.risk_level);
  const RiskIcon = config.icon;
  
  return (
    <div className={`p-6 rounded-lg border-2 ${config.bg} ${config.border}`}>
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-4">
        <Badge className={`${config.color} bg-white`}>
          <RiskIcon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
        <span className="text-sm text-gray-600">
          {decision.confidence}% confidence
        </span>
      </div>
      
      {/* Main action */}
      <p className="text-lg font-semibold mb-3 leading-snug text-gray-900">
        {decision.action}
      </p>
      
      {/* Key metric */}
      <div className={`text-2xl font-bold ${config.color}`}>
        {decision.primary_metric}
      </div>
    </div>
  );
}
