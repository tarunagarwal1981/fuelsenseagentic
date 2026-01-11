/**
 * Route Calculator Tool Configuration
 *
 * Configuration for the route calculator tool that calculates
 * optimal maritime routes between ports.
 */
export interface RouteCalculatorToolConfig {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    timeout?: number;
    retries?: number;
}
export declare const routeCalculatorConfig: RouteCalculatorToolConfig;
//# sourceMappingURL=route-calculator.config.d.ts.map