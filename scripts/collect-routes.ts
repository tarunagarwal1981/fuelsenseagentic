/**
 * Route Collection Script
 * 
 * Collects route data for 10 common/complex routes by calling the Maritime Route API.
 * Stores results in JSON format for use as cached routes.
 * 
 * Usage: npx tsx scripts/collect-routes.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Route definitions
const ROUTES_TO_COLLECT = [
  {
    id: 'SGSIN-AEJEA',
    origin_port_code: 'SGSIN',
    destination_port_code: 'AEJEA',
    origin_name: 'Singapore',
    destination_name: 'Jebel Ali (Dubai)',
    description: 'Singapore to Jebel Ali via Suez Canal',
    popularity: 'high' as const,
  },
  {
    id: 'SGSIN-NLRTM',
    origin_port_code: 'SGSIN',
    destination_port_code: 'NLRTM',
    origin_name: 'Singapore',
    destination_name: 'Rotterdam',
    description: 'Singapore to Rotterdam via Suez Canal',
    popularity: 'high' as const,
  },
  {
    id: 'AEJEA-NLRTM',
    origin_port_code: 'AEJEA',
    destination_port_code: 'NLRTM',
    origin_name: 'Jebel Ali (Dubai)',
    destination_name: 'Rotterdam',
    description: 'Jebel Ali to Rotterdam via Suez Canal',
    popularity: 'high' as const,
  },
  {
    id: 'SGSIN-AEFJR',
    origin_port_code: 'SGSIN',
    destination_port_code: 'AEFJR',
    origin_name: 'Singapore',
    destination_name: 'Fujairah',
    description: 'Singapore to Fujairah (short route)',
    popularity: 'medium' as const,
  },
  {
    id: 'NLRTM-SGSIN',
    origin_port_code: 'NLRTM',
    destination_port_code: 'SGSIN',
    origin_name: 'Rotterdam',
    destination_name: 'Singapore',
    description: 'Rotterdam to Singapore (return route)',
    popularity: 'high' as const,
  },
  {
    id: 'SGSIN-LKCMB',
    origin_port_code: 'SGSIN',
    destination_port_code: 'LKCMB',
    origin_name: 'Singapore',
    destination_name: 'Colombo',
    description: 'Singapore to Colombo (Indian Ocean)',
    popularity: 'medium' as const,
  },
  {
    id: 'AEJEA-EGPSD',
    origin_port_code: 'AEJEA',
    destination_port_code: 'EGPSD',
    origin_name: 'Jebel Ali (Dubai)',
    destination_name: 'Port Said',
    description: 'Jebel Ali to Port Said (Red Sea)',
    popularity: 'medium' as const,
  },
  {
    id: 'NLRTM-AEJEA',
    origin_port_code: 'NLRTM',
    destination_port_code: 'AEJEA',
    origin_name: 'Rotterdam',
    destination_name: 'Jebel Ali (Dubai)',
    description: 'Rotterdam to Jebel Ali via Suez Canal',
    popularity: 'high' as const,
  },
  {
    id: 'SGSIN-INMUN',
    origin_port_code: 'SGSIN',
    destination_port_code: 'INMUN',
    origin_name: 'Singapore',
    destination_name: 'Mumbai',
    description: 'Singapore to Mumbai (Indian Ocean)',
    popularity: 'medium' as const,
  },
  {
    id: 'AEFJR-NLRTM',
    origin_port_code: 'AEFJR',
    destination_port_code: 'NLRTM',
    origin_name: 'Fujairah',
    destination_name: 'Rotterdam',
    description: 'Fujairah to Rotterdam via Suez Canal',
    popularity: 'medium' as const,
  },
];

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
  waypoints: Array<{ lat: number; lon: number }>;
  cached_at: string;
  popularity: 'high' | 'medium' | 'low';
}

/**
 * Call Maritime Route API with extended timeout
 */
async function fetchRoute(
  originCode: string,
  destCode: string,
  timeoutMs: number = 60000
): Promise<any> {
  // Import port coordinates
  const portsPath = path.join(__dirname, '../frontend/lib/data/ports.json');
  const portsData = JSON.parse(fs.readFileSync(portsPath, 'utf-8'));
  
  const originPort = portsData.find((p: any) => p.port_code === originCode);
  const destPort = portsData.find((p: any) => p.port_code === destCode);
  
  if (!originPort || !destPort) {
    throw new Error(`Port not found: ${originCode} or ${destCode}`);
  }
  
  const params = new URLSearchParams({
    origin_lon: originPort.coordinates.lon.toString(),
    origin_lat: originPort.coordinates.lat.toString(),
    dest_lon: destPort.coordinates.lon.toString(),
    dest_lat: destPort.coordinates.lat.toString(),
    speed: '14',
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(
      `https://maritime-route-api.onrender.com/route?${params.toString()}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(`API returned unsuccessful status: ${data.status}`);
    }
    
    // Convert to our format
    const waypoints = data.route.coordinates.map(([lon, lat]: [number, number]) => ({
      lat,
      lon: lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, // Normalize longitude
    }));
    
    return {
      distance_nm: data.distance.value,
      estimated_hours: data.duration?.value || data.distance.value / 14,
      route_type: determineRouteType(waypoints, originCode, destCode),
      waypoints,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Determine route type based on waypoints
 */
function determineRouteType(
  waypoints: Array<{ lat: number; lon: number }>,
  origin: string,
  dest: string
): string {
  // Check for Suez Canal (waypoints near 30-32°N, 32-33°E)
  const nearSuez = waypoints.some(
    (wp) => wp.lat >= 30 && wp.lat <= 32 && wp.lon >= 32 && wp.lon <= 33
  );
  
  if (nearSuez) {
    return 'via Suez Canal';
  }
  
  // Check for Panama Canal (waypoints near 9°N, 79-80°W)
  const nearPanama = waypoints.some(
    (wp) => wp.lat >= 8 && wp.lat <= 10 && wp.lon >= -80 && wp.lon <= -79
  );
  
  if (nearPanama) {
    return 'via Panama Canal';
  }
  
  return 'direct route';
}

/**
 * Main collection function
 */
async function collectRoutes() {
  console.log('🚀 Starting route collection...\n');
  
  const results: CachedRoute[] = [];
  const errors: Array<{ route: string; error: string }> = [];
  
  for (let i = 0; i < ROUTES_TO_COLLECT.length; i++) {
    const route = ROUTES_TO_COLLECT[i];
    console.log(`[${i + 1}/${ROUTES_TO_COLLECT.length}] Collecting: ${route.origin_name} → ${route.destination_name}...`);
    
    try {
      // Try with 60 second timeout
      const routeData = await fetchRoute(
        route.origin_port_code,
        route.destination_port_code,
        60000
      );
      
      const cachedRoute: CachedRoute = {
        id: route.id,
        origin_port_code: route.origin_port_code,
        destination_port_code: route.destination_port_code,
        origin_name: route.origin_name,
        destination_name: route.destination_name,
        description: route.description,
        distance_nm: routeData.distance_nm,
        estimated_hours: routeData.estimated_hours,
        route_type: routeData.route_type,
        waypoints: routeData.waypoints,
        cached_at: new Date().toISOString(),
        popularity: route.popularity,
      };
      
      results.push(cachedRoute);
      console.log(`✅ Success: ${routeData.distance_nm.toFixed(2)}nm, ${routeData.waypoints.length} waypoints\n`);
      
      // Wait 2 seconds between requests to avoid rate limiting
      if (i < ROUTES_TO_COLLECT.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`❌ Failed: ${errorMsg}\n`);
      errors.push({ route: route.id, error: errorMsg });
    }
  }
  
  // Save results
  const outputPath = path.join(__dirname, '../frontend/lib/data/cached-routes.json');
  const output = {
    routes: results,
    collected_at: new Date().toISOString(),
    total_routes: results.length,
    errors: errors.length > 0 ? errors : undefined,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log('\n📊 Collection Summary:');
  console.log(`✅ Successfully collected: ${results.length}/${ROUTES_TO_COLLECT.length} routes`);
  if (errors.length > 0) {
    console.log(`❌ Failed: ${errors.length} routes`);
    errors.forEach(e => console.log(`   - ${e.route}: ${e.error}`));
  }
  console.log(`\n💾 Saved to: ${outputPath}`);
}

// Run if executed directly
if (require.main === module) {
  collectRoutes().catch(console.error);
}

export { collectRoutes };

