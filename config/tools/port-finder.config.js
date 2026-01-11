"use strict";
/**
 * Port Finder Tool Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.portFinderConfig = void 0;
exports.portFinderConfig = {
    name: 'find_ports_near_route',
    description: 'Find bunker ports near a shipping route',
    implementation: '@/lib/tools/port-finder',
    inputSchema: {
        type: 'object',
        properties: {
            route_waypoints: { type: 'array' },
            max_deviation_nm: { type: 'number', default: 150 },
        },
        required: ['route_waypoints'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            ports: { type: 'array' },
        },
    },
    timeout: 30000,
    retries: 2,
};
//# sourceMappingURL=port-finder.config.js.map