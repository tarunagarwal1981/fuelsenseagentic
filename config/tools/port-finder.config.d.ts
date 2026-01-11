/**
 * Port Finder Tool Configuration
 */
export interface PortFinderToolConfig {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    timeout?: number;
    retries?: number;
}
export declare const portFinderConfig: PortFinderToolConfig;
//# sourceMappingURL=port-finder.config.d.ts.map