/**
 * Route Selector Component
 * 
 * Beautiful route selector for the right pane.
 * Displays cached routes and allows selection.
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Route, Search, Clock, MapPin, TrendingUp } from "lucide-react";

interface CachedRoute {
  id: string;
  origin_port_code: string;
  destination_port_code: string;
  origin_name: string;
  destination_name: string;
  description: string;
  distance_nm: number;
  estimated_hours: number;
  route_type: string;
  popularity: "high" | "medium" | "low";
}

interface RouteSelectorProps {
  routes: CachedRoute[];
  selectedRouteId: string | null;
  onRouteSelect: (routeId: string) => void;
}

export function RouteSelector({ routes, selectedRouteId, onRouteSelect }: RouteSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRoutes = routes.filter((route) => {
    const query = searchQuery.toLowerCase();
    return (
      route.origin_name.toLowerCase().includes(query) ||
      route.destination_name.toLowerCase().includes(query) ||
      route.description.toLowerCase().includes(query) ||
      route.route_type.toLowerCase().includes(query)
    );
  });

  const getPopularityColor = (popularity: string) => {
    switch (popularity) {
      case "high":
        return "bg-green-100 text-green-800 border-green-300";
      case "medium":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getRouteTypeIcon = (routeType: string) => {
    if (routeType.includes("Suez")) return "🚢";
    if (routeType.includes("Panama")) return "🌉";
    return "📍";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h3 className="font-semibold text-sm dark:text-white">Cached Routes</h3>
        <Badge variant="secondary" className="text-xs">
          {routes.length}
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search routes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      {/* Route List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredRoutes.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No routes found
          </div>
        ) : (
          filteredRoutes.map((route) => {
            const isSelected = selectedRouteId === route.id;
            return (
              <Card
                key={route.id}
                className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                  isSelected
                    ? "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
                    : "border hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800"
                }`}
                onClick={() => onRouteSelect(route.id)}
              >
                <div className="space-y-2">
                  {/* Route Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="font-semibold text-sm truncate dark:text-white">
                          {route.origin_name} → {route.destination_name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {route.description}
                      </p>
                    </div>
                    <Badge
                      className={`text-xs ${getPopularityColor(route.popularity)}`}
                    >
                      {route.popularity}
                    </Badge>
                  </div>

                  {/* Route Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Distance:</span>
                      <span className="font-medium">
                        {route.distance_nm.toFixed(0)}nm
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium">
                        {Math.round(route.estimated_hours / 24)}d
                      </span>
                    </div>
                  </div>

                  {/* Route Type */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{getRouteTypeIcon(route.route_type)}</span>
                    <span className="text-xs text-muted-foreground">
                      {route.route_type}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

