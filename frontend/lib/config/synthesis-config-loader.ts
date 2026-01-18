/**
 * Synthesis Config Loader
 * 
 * Loads and caches YAML-based synthesis configuration.
 * Controls when and how cross-agent synthesis runs.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

export interface SynthesisLLMConfig {
  model: string;
  max_tokens: number;
  temperature: number;
}

export interface SynthesisFeatures {
  executive_insight: boolean;
  strategic_priorities: boolean;
  cross_agent_connections: boolean;
  hidden_opportunities: boolean;
  risk_alerts: boolean;
  financial_analysis: boolean;
}

export interface SynthesisConfig {
  enabled: boolean;
  min_agents_for_synthesis: number;
  always_synthesize_combinations: string[][];
  skip_synthesis_combinations: string[][];
  llm: SynthesisLLMConfig;
  max_synthesis_cost_usd: number;
  min_confidence_score: number;
  timeout_seconds: number;
  features: SynthesisFeatures;
}

export interface DomainRule {
  enabled: boolean;
  focus: string[];
}

export interface DomainRules {
  hull_cii_synergy?: DomainRule;
  commercial_technical_synergy?: DomainRule;
  compliance_focus?: DomainRule;
  [key: string]: DomainRule | undefined;
}

export interface SynthesisConfigFile {
  synthesis: SynthesisConfig;
  domain_rules?: DomainRules;
}

// ============================================================================
// Synthesis Config Loader Class
// ============================================================================

export class SynthesisConfigLoader {
  private config: SynthesisConfig | null = null;
  private domainRules: DomainRules | null = null;
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(process.cwd(), 'config');
  }

  /**
   * Load synthesis configuration
   */
  public load(): SynthesisConfig {
    if (this.config) {
      console.log('✅ [SYNTHESIS-CONFIG] Cache hit');
      return this.config;
    }

    const configPath = path.join(this.configDir, 'synthesis-config.yaml');

    if (!fs.existsSync(configPath)) {
      console.warn('⚠️ [SYNTHESIS-CONFIG] Config file not found, using defaults');
      this.config = this.getDefaultConfig();
      return this.config;
    }

    try {
      const fileContents = fs.readFileSync(configPath, 'utf8');
      const data = yaml.load(fileContents) as SynthesisConfigFile;

      // Validate
      this.validateConfig(data);

      this.config = data.synthesis;
      this.domainRules = data.domain_rules || null;

      console.log('✅ [SYNTHESIS-CONFIG] Loaded configuration');
      console.log(`   Enabled: ${this.config.enabled}`);
      console.log(`   Min agents: ${this.config.min_agents_for_synthesis}`);
      console.log(`   LLM model: ${this.config.llm.model}`);

      return this.config;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ [SYNTHESIS-CONFIG] Error loading config:', message);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  /**
   * Get domain-specific synthesis rules
   */
  public getDomainRules(): DomainRules | null {
    if (!this.config) {
      this.load();
    }
    return this.domainRules;
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(data: SynthesisConfigFile): void {
    if (!data.synthesis) {
      throw new Error('Missing "synthesis" root property');
    }

    const s = data.synthesis;

    if (typeof s.enabled !== 'boolean') {
      throw new Error('synthesis.enabled must be a boolean');
    }

    if (typeof s.min_agents_for_synthesis !== 'number' || s.min_agents_for_synthesis < 1) {
      throw new Error('synthesis.min_agents_for_synthesis must be a positive number');
    }

    if (!s.llm || !s.llm.model) {
      throw new Error('synthesis.llm.model is required');
    }

    if (!s.features) {
      throw new Error('synthesis.features is required');
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): SynthesisConfig {
    return {
      enabled: true,
      min_agents_for_synthesis: 6,
      always_synthesize_combinations: [],
      skip_synthesis_combinations: [],
      llm: {
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        temperature: 0.3,
      },
      max_synthesis_cost_usd: 0.05,
      min_confidence_score: 0.7,
      timeout_seconds: 10,
      features: {
        executive_insight: true,
        strategic_priorities: true,
        cross_agent_connections: true,
        hidden_opportunities: true,
        risk_alerts: true,
        financial_analysis: true,
      },
    };
  }

  /**
   * Clear cache (useful for testing/hot reload)
   */
  public clearCache(): void {
    this.config = null;
    this.domainRules = null;
    console.log('🗑️ [SYNTHESIS-CONFIG] Cache cleared');
  }

  /**
   * Check if synthesis should run for given agents
   */
  public shouldSynthesize(agentNames: string[]): boolean {
    const config = this.load();

    if (!config.enabled) {
      return false;
    }

    // Check skip combinations first
    for (const skipCombo of config.skip_synthesis_combinations) {
      if (this.matchesCombination(agentNames, skipCombo)) {
        return false;
      }
    }

    // Check always synthesize combinations
    for (const alwaysCombo of config.always_synthesize_combinations) {
      if (this.containsAllAgents(agentNames, alwaysCombo)) {
        return true;
      }
    }

    // Fall back to minimum agents check
    return agentNames.length >= config.min_agents_for_synthesis;
  }

  /**
   * Check if agent list exactly matches a combination
   */
  private matchesCombination(agents: string[], combination: string[]): boolean {
    if (agents.length !== combination.length) {
      return false;
    }
    const sortedAgents = [...agents].sort();
    const sortedCombo = [...combination].sort();
    return sortedAgents.every((agent, i) => agent === sortedCombo[i]);
  }

  /**
   * Check if agent list contains all agents in a combination
   */
  private containsAllAgents(agents: string[], combination: string[]): boolean {
    return combination.every(agent => agents.includes(agent));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loaderInstance: SynthesisConfigLoader | null = null;

export function getSynthesisConfig(): SynthesisConfig {
  if (!loaderInstance) {
    loaderInstance = new SynthesisConfigLoader();
  }
  return loaderInstance.load();
}

export function getSynthesisConfigLoader(): SynthesisConfigLoader {
  if (!loaderInstance) {
    loaderInstance = new SynthesisConfigLoader();
  }
  return loaderInstance;
}

export function getDomainRules(): DomainRules | null {
  return getSynthesisConfigLoader().getDomainRules();
}
