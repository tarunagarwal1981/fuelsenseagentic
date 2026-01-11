"use strict";
/**
 * Route Calculator Tool Configuration
 *
 * Configuration for the route calculator tool that calculates
 * optimal maritime routes between ports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeCalculatorConfig = void 0;
exports.routeCalculatorConfig = {
    name: 'calculate_route',
    description: 'Calculate optimal maritime route between two ports',
    implementation: '@/lib/tools/route-calculator',
    inputSchema: {
        type: 'object',
        properties: {
            origin_port_code: { type: 'string' },
            destination_port_code: { type: 'string' },
            vessel_speed_knots: { type: 'number', default: 14 },
        },
        required: ['origin_port_code', 'destination_port_code'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            distance_nm: { type: 'number' },
            estimated_hours: { type: 'number' },
            waypoints: { type: 'array' },
        },
    },
    timeout: 30000,
    retries: 2,
};
//# sourceMappingURL=route-calculator.config.js.map