/**
 * Configuration for the complete bunker agent
 */
interface CompleteBunkerAgentOptions {
    /** Show map visualization (default: true) */
    showMap?: boolean;
    /** Fuel quantity in metric tons (default: 1000) */
    fuelQuantityMT?: number;
    /** Vessel speed in knots (default: 14) */
    vesselSpeed?: number;
    /** Vessel consumption in MT per day (default: 35) */
    vesselConsumption?: number;
    /** Claude model to use */
    model?: string;
    /** Enable detailed logging */
    enableLogging?: boolean;
}
/**
 * Result from complete bunker agent
 */
export interface CompleteBunkerAgentResult {
    /** Calculated route data */
    route?: any;
    /** Found ports along route */
    ports?: any;
    /** Fetched price data */
    prices?: any;
    /** Analysis results */
    analysis?: any;
}
/**
 * Complete Bunker Optimization Agent
 *
 * A comprehensive agent that orchestrates all bunker optimization tools:
 * 1. Route Calculator - Calculates optimal maritime routes
 * 2. Port Finder - Finds bunker ports along routes
 * 3. Price Fetcher - Gets current fuel prices
 * 4. Bunker Analyzer - Performs cost-benefit analysis
 *
 * The agent automatically chains these tools together to provide
 * complete bunker optimization recommendations.
 */
export declare function runCompleteBunkerAgent(userMessage: string, options?: CompleteBunkerAgentOptions): Promise<CompleteBunkerAgentResult>;
/**
 * Convenience function to run the complete bunker agent
 *
 * @param userMessage - The user's question or request
 * @param options - Optional configuration
 * @returns Complete analysis results
 */
export declare function askCompleteBunkerAgent(userMessage: string, options?: CompleteBunkerAgentOptions): Promise<CompleteBunkerAgentResult>;
export {};
//# sourceMappingURL=complete-bunker-agent.d.ts.map