/**
 * Intent Classifier Error Handling Tests (Jest + mocks)
 *
 * Tests malformed LLM response and network timeout scenarios
 * that require module mocking.
 */

import { IntentClassifier } from '@/lib/multi-agent/intent-classifier';

// Mock LLMFactory to control LLM behavior
const mockInvoke = jest.fn();
jest.mock('@/lib/multi-agent/llm-factory', () => ({
  LLMFactory: {
    getLLMForTask: () => ({
      invoke: mockInvoke,
    }),
  },
}));

// Mock ServiceContainer to avoid Redis/DB init
jest.mock('@/lib/repositories/service-container', () => ({
  ServiceContainer: {
    getInstance: () => ({
      getCache: () => null,
    }),
  },
}));

// Mock agent registry
jest.mock('@/lib/registry/agent-registry', () => ({
  AgentRegistry: {
    getInstance: () => ({
      getAll: () => [
        { id: 'route_agent', enabled: true, type: 'specialist', intents: ['route_calculation'] },
        { id: 'weather_agent', enabled: true, type: 'specialist', intents: ['port_weather'] },
      ],
    }),
  },
}));

// In-memory cache for tests
const createMockCache = () => {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: jest.fn(),
    clear: jest.fn(),
  };
};

describe('IntentClassifier Error Handling', () => {
  let mockCache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = createMockCache();
  });

  it('returns null when LLM response has no JSON', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Here is my response: I think the user wants route information. No JSON here.',
    });

    const result = await IntentClassifier.classify('route from Singapore to Rotterdam', {
      cache: mockCache as any,
      skipCache: true,
      correlationId: 'test-malformed',
    });

    expect(result).toBeNull();
  });

  it('returns null when LLM response has invalid JSON structure (missing agent_id)', async () => {
    mockInvoke.mockResolvedValue({
      content: '{"intent":"route_calculation","confidence":0.9}',
    });

    const result = await IntentClassifier.classify('route from A to B', {
      cache: mockCache as any,
      skipCache: true,
    });

    expect(result).toBeNull();
  });

  it('returns null when LLM response has invalid JSON (parse error)', async () => {
    mockInvoke.mockResolvedValue({
      content: '{ "agent_id": "route_agent", "intent": invalid json }',
    });

    const result = await IntentClassifier.classify('route query', {
      cache: mockCache as any,
      skipCache: true,
    });

    expect(result).toBeNull();
  });

  it('returns null when LLM throws (network timeout)', async () => {
    mockInvoke.mockRejectedValue(new Error('Network timeout'));

    const result = await IntentClassifier.classify('weather at Singapore', {
      cache: mockCache as any,
      skipCache: true,
    });

    expect(result).toBeNull();
  });

  it('returns null when LLM throws ECONNREFUSED', async () => {
    const err = new Error('connect ECONNREFUSED');
    (err as any).code = 'ECONNREFUSED';
    mockInvoke.mockRejectedValue(err);

    const result = await IntentClassifier.classify('bunker from Singapore', {
      cache: mockCache as any,
      skipCache: true,
    });

    expect(result).toBeNull();
  });
});
