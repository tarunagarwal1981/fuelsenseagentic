'use client';

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface InformationalResponseCardProps {
  data: {
    answer: string;
    key_facts: string[];
    additional_context?: string;
  };
}

export function InformationalResponseCard({ data }: InformationalResponseCardProps) {
  return (
    <div className="space-y-4">
      {/* Main answer - prominent */}
      <p className="text-lg leading-relaxed text-gray-900">
        {data.answer}
      </p>
      
      {/* Key facts as badges */}
      {data.key_facts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-600">
            Key Facts:
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.key_facts.map((fact, idx) => (
              <Badge 
                key={idx} 
                variant="secondary" 
                className="px-3 py-1.5 text-sm font-normal"
              >
                {fact}
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      {/* Additional context */}
      {data.additional_context && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            {data.additional_context}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
