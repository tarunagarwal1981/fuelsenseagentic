'use client';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle, Lightbulb } from 'lucide-react';

interface ValidationResultCardProps {
  validation: {
    result: 'feasible' | 'not_feasible' | 'risky';
    explanation: string;
    consequence?: string;
    alternative?: string;
  };
}

export function ValidationResultCard({ validation }: ValidationResultCardProps) {
  const getResultConfig = (result: string) => {
    switch (result) {
      case 'feasible':
        return { 
          icon: CheckCircle, 
          color: 'text-green-600', 
          bg: 'bg-green-50',
          border: 'border-green-200',
          label: 'Feasible'
        };
      case 'not_feasible':
        return { 
          icon: XCircle, 
          color: 'text-red-600', 
          bg: 'bg-red-50',
          border: 'border-red-200',
          label: 'Not Feasible'
        };
      case 'risky':
        return { 
          icon: AlertTriangle, 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          label: 'Risky'
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
  
  const config = getResultConfig(validation.result);
  const Icon = config.icon;
  
  return (
    <div className={`p-6 rounded-lg border-2 ${config.bg} ${config.border}`}>
      {/* Result indicator */}
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`h-8 w-8 ${config.color}`} />
        <span className={`text-xl font-bold ${config.color}`}>
          {config.label}
        </span>
      </div>
      
      {/* Explanation */}
      <p className="text-base mb-4 leading-relaxed text-gray-800">
        {validation.explanation}
      </p>
      
      {/* Consequence */}
      {validation.consequence && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Consequence</AlertTitle>
          <AlertDescription>{validation.consequence}</AlertDescription>
        </Alert>
      )}
      
      {/* Alternative */}
      {validation.alternative && (
        <Alert className="bg-blue-50 border-blue-200">
          <Lightbulb className="h-4 w-4 text-blue-600" />
          <AlertTitle className="font-semibold text-blue-900">
            Alternative
          </AlertTitle>
          <AlertDescription className="text-blue-800">
            {validation.alternative}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
