/**
 * Entity Extractor Agent Unit Tests
 *
 * - extractVesselFromHullQuery: regex fallback for hull-style queries
 * - Fallback path: when LLM fails, fallback populates vessel_identifiers and returns success
 */

import {
  entityExtractorAgentNode,
  extractVesselFromHullQuery,
} from '@/lib/multi-agent/agents/entity-extractor-agent';
import type { MultiAgentState } from '@/lib/multi-agent/state';

jest.mock('@/lib/multi-agent/optimizations', () => ({
  ...jest.requireActual('@/lib/multi-agent/optimizations'),
  withTimeout: jest.fn((promise: Promise<unknown>) =>
    Promise.reject(new Error('Entity extraction LLM timeout (20s)'))
  ),
}));

describe('extractVesselFromHullQuery', () => {
  it('extracts vessel name from "give me hull performance of neptune star"', () => {
    const result = extractVesselFromHullQuery('give me hull performance of neptune star');
    expect(result).toEqual({ name: 'NEPTUNE STAR' });
  });

  it('extracts vessel name from "hull performance of OCEAN PRIDE"', () => {
    const result = extractVesselFromHullQuery('hull performance of OCEAN PRIDE');
    expect(result).toEqual({ name: 'OCEAN PRIDE' });
  });

  it('extracts vessel name from "hull condition for Pacific Star"', () => {
    const result = extractVesselFromHullQuery('hull condition for Pacific Star');
    expect(result).toEqual({ name: 'PACIFIC STAR' });
  });

  it('extracts vessel name from "show me hull performance for MV ATLANTIC"', () => {
    const result = extractVesselFromHullQuery('show me hull performance for MV ATLANTIC');
    expect(result).toEqual({ name: 'MV ATLANTIC' });
  });

  it('extracts 7-digit IMO from query with IMO prefix', () => {
    const result = extractVesselFromHullQuery('hull performance for IMO 5004001');
    expect(result).toEqual({ imo: '5004001' });
  });

  it('extracts 7-digit IMO without prefix', () => {
    const result = extractVesselFromHullQuery('hull performance 9876543');
    expect(result).toEqual({ imo: '9876543' });
  });

  it('returns null for non-hull query', () => {
    expect(extractVesselFromHullQuery('What is the weather in Singapore?')).toBeNull();
    expect(extractVesselFromHullQuery('bunker prices from Rotterdam')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractVesselFromHullQuery('')).toBeNull();
    expect(extractVesselFromHullQuery('   ')).toBeNull();
  });
});

describe('entityExtractorAgentNode fallback when LLM fails', () => {
  function makeState(overrides: Partial<MultiAgentState> = {}): MultiAgentState {
    return {
      messages: [],
      vessel_identifiers: undefined,
      agent_status: {},
      agent_errors: {},
      ...overrides,
    } as MultiAgentState;
  }

  function makeUserMessage(content: string) {
    return { role: 'user' as const, content };
  }

  it('uses fallback to extract vessel when LLM throws and query is hull-style', async () => {
    const state = makeState({
      messages: [makeUserMessage('give me hull performance of neptune star')],
    });
    const result = await entityExtractorAgentNode(state);
    expect(result.vessel_identifiers).toBeDefined();
    expect(result.vessel_identifiers?.names).toContain('NEPTUNE STAR');
    expect(result.vessel_identifiers?.names?.length).toBe(1);
    expect(result.agent_status?.entity_extractor).toBe('success');
  });

  it('returns failed state when LLM throws and query has no hull vessel pattern', async () => {
    const state = makeState({
      messages: [makeUserMessage('What is the weather in Singapore?')],
    });
    const result = await entityExtractorAgentNode(state);
    expect(result.agent_status?.entity_extractor).toBe('failed');
    expect(result.agent_errors?.entity_extractor).toBeDefined();
    expect(result.vessel_identifiers).toBeUndefined();
  });
});
