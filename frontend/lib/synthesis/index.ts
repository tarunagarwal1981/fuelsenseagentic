/**
 * Synthesis Module
 *
 * Exports for the decoupled synthesis engine and template system.
 */

export {
  SynthesisEngine,
  getSynthesisEngine,
} from './synthesis-engine';

export {
  TemplateEngine,
  getTemplateEngine,
} from './template-engine';

export {
  TemplateSelector,
  getTemplateSelector,
} from './template-selector';

export type {
  SynthesizedResponse,
  Insight,
  Recommendation,
  Warning,
  Alert,
  ExecutionMetrics,
  NextStep,
} from './types';

export type {
  RenderOptions,
} from './template-engine';

export type {
  TemplateInfo,
  RequestContext,
  UserProfile,
} from './template-selector';

