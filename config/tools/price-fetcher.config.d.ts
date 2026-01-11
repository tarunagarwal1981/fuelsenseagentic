/**
 * Price Fetcher Tool Configuration
 */
export interface PriceFetcherToolConfig {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    timeout?: number;
    retries?: number;
}
export declare const priceFetcherConfig: PriceFetcherToolConfig;
//# sourceMappingURL=price-fetcher.config.d.ts.map