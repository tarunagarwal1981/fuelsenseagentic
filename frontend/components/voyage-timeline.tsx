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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-base">Voyage Timeline</CardTitle>
          <Badge variant="secondary" className="text-xs">{data.events.length} Event{data.events.length !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Desktop: Compact Horizontal Timeline */}
        <div className="hidden md:block">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {data.events.map((event, idx) => {
              const isExpanded = expandedEvents.has(idx);

              return (
                <div key={idx} className="flex-shrink-0 w-[200px]">
                  <div className="bg-white rounded-lg border p-2.5 space-y-1.5">
                    {/* Event Icon + Title */}
                    <div className="flex items-center gap-2">
                      <div className={`
                        w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0
                        ${event.actionRequired 
                          ? 'bg-orange-100 border border-orange-400' 
                          : 'bg-blue-100 border border-blue-400'
                        }
                      `}>
                        {event.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">{event.title}</h4>
                        {event.actionRequired && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px] px-1 py-0 mt-0.5">
                            Action
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>

                    {/* Time Badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {event.hourFormatted}
                      </Badge>
                      {event.locationFormatted && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                          <MapPin className="h-2.5 w-2.5 mr-0.5" />
                          <span className="truncate max-w-[80px]">{event.locationFormatted}</span>
                        </Badge>
                      )}
                    </div>

                    {/* Expand Button (if has location details) */}
                    {event.location && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleEvent(idx)}
                        className="w-full justify-between px-1.5 h-6 text-[10px]"
                      >
                        <span className="text-[10px] text-muted-foreground">
                          {isExpanded ? 'Less' : 'Details'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                    )}

                    {/* Expanded Details */}
                    {isExpanded && event.location && (
                      <div className="bg-muted/50 rounded p-2 space-y-0.5 text-[10px]">
                        <div>
                          <span className="text-muted-foreground">Coords:</span>{' '}
                          {event.location.lat.toFixed(2)}°N, {Math.abs(event.location.lon).toFixed(2)}°{event.location.lon >= 0 ? 'E' : 'W'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Time:</span>{' '}
                          {event.hourFromStart.toFixed(1)}h
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: Horizontal Scrollable Timeline (same compact style) */}
        <div className="md:hidden">
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {data.events.map((event, idx) => {
                const isExpanded = expandedEvents.has(idx);

                return (
                  <div key={idx} className="flex-shrink-0 w-[200px]">
                    <div className="bg-white rounded-lg border p-2.5 space-y-1.5">
                      {/* Event Icon + Title */}
                      <div className="flex items-center gap-2">
                        <div className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0
                          ${event.actionRequired 
                            ? 'bg-orange-100 border border-orange-400' 
                            : 'bg-blue-100 border border-blue-400'
                          }
                        `}>
                          {event.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate">{event.title}</h4>
                          {event.actionRequired && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px] px-1 py-0 mt-0.5">
                              Action
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>

                      {/* Time Badge */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          {event.hourFormatted}
                        </Badge>
                        {event.locationFormatted && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            <span className="truncate max-w-[80px]">{event.locationFormatted}</span>
                          </Badge>
                        )}
                      </div>

                      {/* Expand Button (if has location details) */}
                      {event.location && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEvent(idx)}
                          className="w-full justify-between px-1.5 h-6 text-[10px]"
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {isExpanded ? 'Less' : 'Details'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && event.location && (
                        <div className="bg-muted/50 rounded p-2 space-y-0.5 text-[10px]">
                          <div>
                            <span className="text-muted-foreground">Coords:</span>{' '}
                            {event.location.lat.toFixed(2)}°N, {Math.abs(event.location.lon).toFixed(2)}°{event.location.lon >= 0 ? 'E' : 'W'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Time:</span>{' '}
                            {event.hourFromStart.toFixed(1)}h
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

