"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/tools/__tests__/port-finder.test.ts
const port_finder_1 = require("../port-finder");
const route_calculator_1 = require("../route-calculator");
async function testPortFinder() {
    console.log('\n🧪 TESTING PORT FINDER TOOL\n');
    console.log('='.repeat(80));
    try {
        // First, calculate a route to get waypoints
        console.log('\n📦 Step 1: Calculate route Singapore → Rotterdam');
        const route = await (0, route_calculator_1.executeRouteCalculatorTool)({
            origin_port_code: 'SGSIN',
            destination_port_code: 'NLRTM',
            vessel_speed_knots: 14,
        });
        console.log(`   ✅ Route calculated: ${route.distance_nm.toFixed(2)} nm, ${route.waypoints.length} waypoints`);
        // Test 1: Find ports with default deviation (150nm)
        console.log('\n📦 Test 1: Find ports within 150nm of route');
        const result150 = await (0, port_finder_1.executePortFinderTool)({
            route_waypoints: route.waypoints,
            max_deviation_nm: 150,
        });
        console.log(`\n   Results: ${result150.total_ports_found} ports found`);
        console.log(`   Waypoints analyzed: ${result150.waypoints_analyzed}`);
        console.log(`   Max deviation: ${result150.max_deviation_nm} nm`);
        console.log('\n   Top 10 ports (closest first):');
        result150.ports.slice(0, 10).forEach((foundPort, i) => {
            const port = foundPort.port;
            console.log(`   ${(i + 1).toString().padStart(2)}. ${port.name.padEnd(25)} ${port.port_code.padEnd(8)} ` +
                `${foundPort.distance_from_route_nm.toFixed(1).padStart(6)} nm  ` +
                `${port.fuel_capabilities.join(', ')}`);
        });
        if (result150.ports.length > 10) {
            console.log(`   ... and ${result150.ports.length - 10} more ports`);
        }
        // Test 2: Tighter deviation (100nm)
        console.log('\n\n📦 Test 2: Find ports within 100nm of route');
        const result100 = await (0, port_finder_1.executePortFinderTool)({
            route_waypoints: route.waypoints,
            max_deviation_nm: 100,
        });
        console.log(`   ✅ Found ${result100.total_ports_found} ports (narrower search)`);
        if (result100.ports.length > 0) {
            console.log('\n   Closest ports:');
            result100.ports.slice(0, 5).forEach((foundPort, i) => {
                const port = foundPort.port;
                console.log(`   ${(i + 1).toString().padStart(2)}. ${port.name.padEnd(25)} ${port.port_code.padEnd(8)} ` +
                    `${foundPort.distance_from_route_nm.toFixed(1).padStart(6)} nm`);
            });
        }
        // Test 3: Very tight deviation (50nm)
        console.log('\n\n📦 Test 3: Find ports within 50nm of route (very tight)');
        const result50 = await (0, port_finder_1.executePortFinderTool)({
            route_waypoints: route.waypoints,
            max_deviation_nm: 50,
        });
        console.log(`   ✅ Found ${result50.total_ports_found} ports (very tight search)`);
        if (result50.ports.length > 0) {
            console.log('\n   Ports found:');
            result50.ports.forEach((foundPort, i) => {
                const port = foundPort.port;
                console.log(`   ${(i + 1).toString().padStart(2)}. ${port.name.padEnd(25)} ${port.port_code.padEnd(8)} ` +
                    `${foundPort.distance_from_route_nm.toFixed(1).padStart(6)} nm  ` +
                    `Waypoint #${foundPort.nearest_waypoint_index}`);
            });
        }
        // Test 4: Different route (shorter route)
        console.log('\n\n📦 Test 4: Find ports on shorter route (Tokyo to Shanghai)');
        const route2 = await (0, route_calculator_1.executeRouteCalculatorTool)({
            origin_port_code: 'JPTYO',
            destination_port_code: 'CNSHA',
            vessel_speed_knots: 15,
        });
        console.log(`   ✅ Route calculated: ${route2.distance_nm.toFixed(2)} nm, ${route2.waypoints.length} waypoints`);
        const resultRoute2 = await (0, port_finder_1.executePortFinderTool)({
            route_waypoints: route2.waypoints,
            max_deviation_nm: 150,
        });
        console.log(`   ✅ Found ${resultRoute2.total_ports_found} ports along Tokyo-Shanghai route`);
        if (resultRoute2.ports.length > 0) {
            console.log('\n   Ports found:');
            resultRoute2.ports.slice(0, 10).forEach((foundPort, i) => {
                const port = foundPort.port;
                console.log(`   ${(i + 1).toString().padStart(2)}. ${port.name.padEnd(25)} ${port.port_code.padEnd(8)} ` +
                    `${foundPort.distance_from_route_nm.toFixed(1).padStart(6)} nm`);
            });
        }
        // Test 5: Direct function call (not through tool wrapper)
        console.log('\n\n📦 Test 5: Direct function call test');
        const directResult = await (0, port_finder_1.findPortsNearRoute)({
            route_waypoints: [
                { lat: 1.2897, lon: 103.8501 }, // Singapore
                { lat: 22.3193, lon: 114.1694 }, // Hong Kong
            ],
            max_deviation_nm: 200,
        });
        console.log(`   ✅ Direct call successful: ${directResult.total_ports_found} ports found`);
        console.log(`   Ports: ${directResult.ports.map(p => p.port.name).join(', ')}`);
        console.log('\n' + '='.repeat(80));
        console.log('🎉 Port Finder Tests Complete!\n');
    }
    catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error(error instanceof Error ? error.message : error);
        if (error instanceof Error && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}
testPortFinder();
//# sourceMappingURL=port-finder.test.js.map