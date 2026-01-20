'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Calendar } from 'lucide-react';

interface PriorityCardProps {
  priority: {
    priority: 1 | 2 | 3;
    action: string;
    why: string;
    impact: string;
    urgency: 'immediate' | 'today' | 'this_week';
  };
}

export function PriorityCard({ priority }: PriorityCardProps) {
  const getUrgencyConfig = (urgency: string) => {
    switch (urgency) {
      case 'immediate':
        return { 
          icon: Zap, 
          color: 'text-red-600',
          bg: 'bg-red-50',
          label: 'IMMEDIATE'
        };
      case 'today':
        return { 
          icon: Clock, 
          color: 'text-yellow-600',
          bg: 'bg-yellow-50',
          label: 'TODAY'
        };
      case 'this_week':
        return { 
          icon: Calendar, 
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          label: 'THIS WEEK'
        };
      default:
        return { 
          icon: Calendar, 
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          label: 'SCHEDULED'
        };
    }
  };
  
  const config = getUrgencyConfig(priority.urgency);
  const UrgencyIcon = config.icon;
  
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      {/* Priority number & urgency */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
            {priority.priority}
          </div>
          <Badge className={`${config.color} ${config.bg} text-xs`}>
            <UrgencyIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </div>
      
      {/* Action */}
      <h4 className="font-semibold mb-3 text-sm leading-snug">
        {priority.action}
      </h4>
      
      {/* Why */}
      <div className="mb-2 pb-2 border-b border-gray-200">
        <p className="text-xs font-medium text-gray-500 mb-1">Why:</p>
        <p className="text-sm text-gray-700">{priority.why}</p>
      </div>
      
      {/* Impact */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">Impact:</p>
        <p className="text-sm font-medium text-gray-900">{priority.impact}</p>
      </div>
    </Card>
  );
}
