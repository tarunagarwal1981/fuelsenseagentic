/**
 * Map Visualizer Utility
 * 
 * Generates interactive HTML maps using Leaflet.js to visualize maritime routes.
 * Creates maps with route polylines, port markers, and route statistics.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { Route, Port, Coordinates } from '../types';

/**
 * Configuration for map visualization
 */
interface MapVisualizerConfig {
  /** Route data to visualize */
  route: Route;
  /** Origin port information */
  originPort: Port;
  /** Destination port information */
  destinationPort: Port;
  /** Output directory (default: 'output') */
  outputDir?: string;
  /** Whether to open the map in browser automatically (default: true) */
  openInBrowser?: boolean;
}

/**
 * Generates an HTML file with an interactive Leaflet.js map
 * 
 * @param config - Map visualization configuration
 * @returns Path to the generated HTML file
 */
export function generateRouteMap(config: MapVisualizerConfig): string {
  const {
    route,
    originPort,
    destinationPort,
    outputDir = 'output',
    openInBrowser = true,
  } = config;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `route_${timestamp}.html`;
  const filepath = path.join(outputDir, filename);

  // Calculate map bounds to center on the route
  const allCoordinates = [
    originPort.coordinates,
    destinationPort.coordinates,
    ...route.waypoints,
  ];

  const lats = allCoordinates.map((c) => c.lat);
  const lons = allCoordinates.map((c) => c.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Center point
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  // Format route statistics
  const distanceFormatted = route.distance_nm.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const hoursFormatted = route.estimated_hours.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const daysFormatted = (route.estimated_hours / 24).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // Generate waypoints array for Leaflet polyline
  const waypointCoords = route.waypoints.map((wp) => [wp.lat, wp.lon] as [number, number]);

  // Generate HTML content
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maritime Route: ${originPort.name} → ${destinationPort.name}</title>
    
    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossorigin=""/>
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            overflow: hidden;
        }
        
        #map {
            width: 100%;
            height: 100vh;
            z-index: 1;
        }
        
        .route-info {
            position: absolute;
            top: 20px;
            right: 20px;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            max-width: 300px;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .route-info h2 {
            margin-bottom: 15px;
            color: #2c3e50;
            font-size: 18px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 8px;
        }
        
        .route-info-item {
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .route-info-label {
            color: #7f8c8d;
            font-weight: 500;
        }
        
        .route-info-value {
            color: #2c3e50;
            font-weight: 600;
            text-align: right;
        }
        
        .route-info-divider {
            height: 1px;
            background: #ecf0f1;
            margin: 12px 0;
        }
        
        .port-info {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #ecf0f1;
        }
        
        .port-name {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 4px;
        }
        
        .port-details {
            font-size: 12px;
            color: #7f8c8d;
        }
        
        @media (max-width: 768px) {
            .route-info {
                top: 10px;
                right: 10px;
                left: 10px;
                max-width: none;
                padding: 15px;
                font-size: 12px;
            }
            
            .route-info h2 {
                font-size: 16px;
            }
        }
        
        .leaflet-popup-content-wrapper {
            border-radius: 8px;
        }
        
        .leaflet-popup-content {
            margin: 15px;
            font-size: 14px;
        }
        
        .popup-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
            font-size: 16px;
        }
        
        .popup-details {
            color: #7f8c8d;
            font-size: 13px;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    
    <div class="route-info">
        <h2>Route Information</h2>
        
        <div class="route-info-item">
            <span class="route-info-label">Distance:</span>
            <span class="route-info-value">${distanceFormatted} nm</span>
        </div>
        
        <div class="route-info-item">
            <span class="route-info-label">Estimated Time:</span>
            <span class="route-info-value">${hoursFormatted} hrs</span>
        </div>
        
        <div class="route-info-item">
            <span class="route-info-label">Estimated Days:</span>
            <span class="route-info-value">${daysFormatted} days</span>
        </div>
        
        <div class="route-info-item">
            <span class="route-info-label">Waypoints:</span>
            <span class="route-info-value">${route.waypoints.length}</span>
        </div>
        
        <div class="route-info-divider"></div>
        
        <div class="port-info">
            <div class="port-name">📍 ${originPort.name}</div>
            <div class="port-details">${originPort.country} (${originPort.port_code})</div>
        </div>
        
        <div class="port-info">
            <div class="port-name">📍 ${destinationPort.name}</div>
            <div class="port-details">${destinationPort.country} (${destinationPort.port_code})</div>
        </div>
    </div>
    
    <!-- Leaflet JS -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
            crossorigin=""></script>
    
    <script>
        // Initialize map
        const map = L.map('map').setView([${centerLat}, ${centerLon}], 3);
        
        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(map);
        
        // Define route waypoints
        const waypoints = ${JSON.stringify(waypointCoords)};
        
        // Create polyline for the route
        const routePolyline = L.polyline(waypoints, {
            color: '#3498db',
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1,
        }).addTo(map);
        
        // Fit map bounds to show entire route
        const bounds = routePolyline.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });
        
        // Origin port marker (green)
        const originIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        
        const originMarker = L.marker([${originPort.coordinates.lat}, ${originPort.coordinates.lon}], {
            icon: originIcon
        }).addTo(map);
        
        originMarker.bindPopup(\`
            <div class="popup-title">🚢 ${originPort.name}</div>
            <div class="popup-details">
                <strong>Port Code:</strong> ${originPort.port_code}<br>
                <strong>Country:</strong> ${originPort.country}<br>
                <strong>Coordinates:</strong> ${originPort.coordinates.lat.toFixed(4)}°, ${originPort.coordinates.lon.toFixed(4)}°<br>
                <strong>Fuel Types:</strong> ${originPort.fuel_capabilities.join(', ')}
            </div>
        \`);
        
        // Destination port marker (red)
        const destIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        
        const destMarker = L.marker([${destinationPort.coordinates.lat}, ${destinationPort.coordinates.lon}], {
            icon: destIcon
        }).addTo(map);
        
        destMarker.bindPopup(\`
            <div class="popup-title">🚢 ${destinationPort.name}</div>
            <div class="popup-details">
                <strong>Port Code:</strong> ${destinationPort.port_code}<br>
                <strong>Country:</strong> ${destinationPort.country}<br>
                <strong>Coordinates:</strong> ${destinationPort.coordinates.lat.toFixed(4)}°, ${destinationPort.coordinates.lon.toFixed(4)}°<br>
                <strong>Fuel Types:</strong> ${destinationPort.fuel_capabilities.join(', ')}
            </div>
        \`);
        
        // Add click handler to route polyline
        routePolyline.on('click', function(e) {
            const distance = ${route.distance_nm};
            const time = ${route.estimated_hours};
            L.popup()
                .setLatLng(e.latlng)
                .setContent(\`Route: \${distance.toLocaleString()} nm, \${time.toFixed(1)} hours\`)
                .openOn(map);
        });
        
        // Console log for debugging
        console.log('Route Map Loaded');
        console.log('Origin:', '${originPort.name}');
        console.log('Destination:', '${destinationPort.name}');
        console.log('Distance:', ${route.distance_nm}, 'nm');
        console.log('Waypoints:', ${route.waypoints.length});
    </script>
</body>
</html>`;

  // Write HTML file
  fs.writeFileSync(filepath, html, 'utf-8');

  console.log(`✅ Map generated: ${filepath}`);

  // Open in browser if requested
  if (openInBrowser) {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${filepath}"`;
    } else if (platform === 'win32') {
      command = `start "" "${filepath}"`;
    } else {
      command = `xdg-open "${filepath}"`;
    }

    exec(command, (error: Error | null) => {
      if (error) {
        console.warn(`⚠️  Could not open browser automatically: ${error.message}`);
        console.log(`   Please open manually: ${filepath}`);
      } else {
        console.log(`🌐 Opening map in browser...`);
      }
    });
  }

  return filepath;
}

/**
 * Convenience function to visualize a route from route calculator output
 * 
 * @param routeOutput - Output from route calculator
 * @param originPort - Origin port data
 * @param destinationPort - Destination port data
 * @param options - Optional configuration
 * @returns Path to generated HTML file
 */
export async function visualizeRoute(
  routeOutput: {
    origin_port_code: string;
    destination_port_code: string;
    distance_nm: number;
    estimated_hours: number;
    waypoints: Coordinates[];
    route_type: string;
  },
  originPort: Port,
  destinationPort: Port,
  options?: {
    outputDir?: string;
    openInBrowser?: boolean;
  }
): Promise<string> {
  const route: Route = {
    origin: routeOutput.origin_port_code,
    destination: routeOutput.destination_port_code,
    distance_nm: routeOutput.distance_nm,
    estimated_hours: routeOutput.estimated_hours,
    waypoints: routeOutput.waypoints,
  };

  return generateRouteMap({
    route,
    originPort,
    destinationPort,
    outputDir: options?.outputDir,
    openInBrowser: options?.openInBrowser,
  });
}

