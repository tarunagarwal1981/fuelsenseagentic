/**
 * Demo script for Map Visualizer
 * 
 * Run with: npx tsx src/utils/map-visualizer-demo.ts
 */

import { calculateRoute } from '../tools/route-calculator';
import { visualizeRoute } from './map-visualizer';
import portsData from '../data/ports.json';

async function main() {
  console.log('\n🗺️  Map Visualizer Demo\n');
  console.log('='.repeat(80));

  try {
    // Calculate route from Singapore to Rotterdam
    console.log('\n📊 Calculating route: Singapore → Rotterdam...\n');
    
    const routeResult = await calculateRoute({
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
      vessel_speed_knots: 14,
    });

    console.log('✅ Route calculated:');
    console.log(`   Distance: ${routeResult.distance_nm.toFixed(2)} nm`);
    console.log(`   Time: ${routeResult.estimated_hours.toFixed(2)} hours`);
    console.log(`   Waypoints: ${routeResult.waypoints.length}`);

    // Get port data
    const originPort = portsData.find((p: any) => p.port_code === 'SGSIN');
    const destinationPort = portsData.find((p: any) => p.port_code === 'NLRTM');

    if (!originPort || !destinationPort) {
      throw new Error('Port data not found');
    }

    // Generate map
    console.log('\n🗺️  Generating map visualization...\n');
    
    const mapPath = await visualizeRoute(
      routeResult,
      originPort as any,
      destinationPort as any,
      {
        openInBrowser: true,
      }
    );

    console.log(`\n✅ Map generated successfully!`);
    console.log(`   File: ${mapPath}`);
    console.log('\n' + '='.repeat(80) + '\n');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

