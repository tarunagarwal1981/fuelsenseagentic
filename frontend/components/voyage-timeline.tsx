'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  MapPin,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { TimelineData } from '@/lib/formatters/response-formatter';

export function VoyageTimeline({ data }: { data: TimelineData | null }) {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  if (!data || data.events.length === 0) {
    return null;
  }

  const toggleEvent = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Voyage Timeline</CardTitle>
          <Badge variant="secondary">{data.events.length} Event{data.events.length !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Desktop: Vertical Timeline */}
        <div className="hidden md:block relative">
          {/* Timeline Line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gray-200" />

          {/* Events */}
          <div className="space-y-6">
            {data.events.map((event, idx) => {
              const isExpanded = expandedEvents.has(idx);
              const isLast = idx === data.events.length - 1;

              return (
                <div key={idx} className="relative flex gap-4">
                  {/* Event Icon */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-lg
                      ${event.actionRequired 
                        ? 'bg-orange-100 border-2 border-orange-400' 
                        : 'bg-blue-100 border-2 border-blue-400'
                      }
                    `}>
                      {event.icon}
                    </div>
                  </div>

                  {/* Event Content */}
                  <div className="flex-1 pb-6">
                    <div className="bg-white rounded-lg border p-4 space-y-2">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">{event.title}</h4>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                        </div>
                        {event.actionRequired && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Action Required
                          </Badge>
                        )}
                      </div>

                      {/* Time Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {event.hourFormatted}
                        </Badge>
                        {event.locationFormatted && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {event.locationFormatted}
                          </Badge>
                        )}
                      </div>

                      {/* Expand Button (if has location details) */}
                      {event.location && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEvent(idx)}
                          className="w-full justify-between px-2"
                        >
                          <span className="text-xs text-muted-foreground">
                            {isExpanded ? 'Show less' : 'Show details'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && event.location && (
                        <div className="bg-muted/50 rounded p-3 space-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Coordinates:</span>{' '}
                            {event.location.lat.toFixed(4)}°N, {Math.abs(event.location.lon).toFixed(4)}°{event.location.lon >= 0 ? 'E' : 'W'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Time from start:</span>{' '}
                            {event.hourFromStart.toFixed(1)} hours
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: Horizontal Scrollable Timeline */}
        <div className="md:hidden">
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {data.events.map((event, idx) => {
                const isExpanded = expandedEvents.has(idx);

                return (
                  <div key={idx} className="flex-shrink-0 w-[280px]">
                    <div className="bg-white rounded-lg border p-4 space-y-2">
                      {/* Event Icon */}
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-lg mx-auto mb-2
                        ${event.actionRequired 
                          ? 'bg-orange-100 border-2 border-orange-400' 
                          : 'bg-blue-100 border-2 border-blue-400'
                        }
                      `}>
                        {event.icon}
                      </div>

                      {/* Header */}
                      <div className="text-center space-y-1">
                        <h4 className="font-semibold text-sm">{event.title}</h4>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>

                      {/* Time Badge */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {event.hourFormatted}
                        </Badge>
                        {event.actionRequired && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Action
                          </Badge>
                        )}
                      </div>

                      {/* Location */}
                      {event.locationFormatted && (
                        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {event.locationFormatted}
                        </div>
                      )}

                      {/* Expand Button (if has location details) */}
                      {event.location && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEvent(idx)}
                          className="w-full justify-between px-2"
                        >
                          <span className="text-xs text-muted-foreground">
                            {isExpanded ? 'Less' : 'Details'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && event.location && (
                        <div className="bg-muted/50 rounded p-3 space-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Coordinates:</span>{' '}
                            {event.location.lat.toFixed(4)}°N, {Math.abs(event.location.lon).toFixed(4)}°{event.location.lon >= 0 ? 'E' : 'W'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Time from start:</span>{' '}
                            {event.hourFromStart.toFixed(1)} hours
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

