/**
 * Bunker Analyzer Tool Configuration
 */
export interface BunkerAnalyzerToolConfig {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    timeout?: number;
    retries?: number;
}
export declare const bunkerAnalyzerConfig: BunkerAnalyzerToolConfig;
//# sourceMappingURL=bunker-analyzer.config.d.ts.map