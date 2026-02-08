/**
 * Synthesis Engine Types
 *
 * Type definitions for the decoupled synthesis engine.
 */

// ============================================================================
// Core Types
// ============================================================================

export interface RoutingContext {
  classification_method: string;
  confidence: number;
  primary_agent: string;
  matched_intent: string;
}

/** Map view hints for frontend (route, bunker ports, weather layers) */
export interface ViewConfig {
  show_map: boolean;
  map_type?: 'route' | 'bunker_ports' | 'weather';
}

export interface SynthesizedResponse {
  synthesizedAt: Date;
  correlationId: string;
  queryType: string;
  success: boolean;
  data: Record<string, any>;
  insights: Insight[];
  recommendations: Recommendation[];
  warnings: Warning[];
  alerts: Alert[];
  metrics: ExecutionMetrics;
  reasoning: string;
  nextSteps: NextStep[];
  /** Routing metadata from supervisor (optional for backward compatibility) */
  routing_context?: RoutingContext;
  /** Hints for frontend map rendering (route, bunker ports, weather) */
  view_config?: ViewConfig;
}

export interface Insight {
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'financial' | 'safety' | 'regulatory' | 'operational';
  title: string;
  description: string;
  impact: Record<string, any>;
  confidence: number;
}

export interface Recommendation {
  id: string;
  priority: number;
  category: string;
  action: string;
  details: Record<string, any>;
  rationale: string;
  impact: Record<string, any>;
  confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  owner: string;
}

export interface Warning {
  level: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
  details: string[];
  impact: string;
}

export interface Alert {
  level: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  title: string;
  message: string;
  action_required: string;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
}

export interface ExecutionMetrics {
  duration_ms: number;
  stages_completed: number;
  stages_failed: number;
  stages_skipped: number;
  llm_calls: number;
  api_calls: number;
  total_cost_usd: number;
  success_rate: number;
  /** Classification confidence from routing (optional) */
  classification_confidence?: number;
  /** Routing method used (pattern_match, llm_intent_classifier, llm_reasoning) */
  routing_method?: string;
}

export interface NextStep {
  order: number;
  action: string;
  description: string;
  owner: string;
  deadline: string;
  dependencies: string[];
}
