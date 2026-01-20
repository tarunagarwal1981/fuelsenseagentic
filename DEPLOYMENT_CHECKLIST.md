# Deployment Checklist - Synthesis v3

## Overview

This checklist covers the deployment of the synthesis v3 system with query type classification and progressive disclosure UI.

## Pre-Deployment Verification

### Code Quality
- [ ] All TypeScript compilation passes (`npm run type-check`)
- [ ] No console errors in browser
- [ ] No React warnings in console
- [ ] All imports resolve correctly
- [ ] No unused variables or imports
- [ ] All files follow project coding standards

### Functional Testing

#### Query Type Classification
- [ ] Informational queries show InformationalResponseCard
- [ ] Decision-required queries show ExecutiveDecisionCard
- [ ] Validation queries show ValidationResultCard
- [ ] Comparison queries show ComparisonResultCard

#### Map Rendering
- [ ] Map renders for all route queries
- [ ] Origin port marker (green) displays correctly
- [ ] Destination port marker (red) displays correctly
- [ ] Bunker port markers (gold/blue) display correctly
- [ ] Route polyline renders correctly
- [ ] ECA zones overlay (if applicable)

#### Tier System
- [ ] Tier 0 (Map) always visible when route exists
- [ ] Tier 1 (Primary response) renders correct card type
- [ ] Tier 2 (Priorities) only shows for decision/validation queries
- [ ] Tier 2 (Risks) shows when critical_risks present
- [ ] Tier 3 (Details accordion) respects synthesis flags

#### Filtering Logic
- [ ] show_multi_port_analysis controls Multi-Port Breakdown
- [ ] show_alternatives controls Alternative Options
- [ ] show_rob_waypoints controls ROB Waypoint Tracking
- [ ] show_weather_details controls Weather Impact Details
- [ ] show_eca_details controls ECA Compliance Details

### Performance Testing
- [ ] Synthesis latency <2 seconds (P95)
- [ ] Total query response time <15 seconds
- [ ] No memory leaks in browser (check DevTools)
- [ ] Component renders efficiently (no unnecessary re-renders)
- [ ] Map loads within 3 seconds

### UI/UX Testing

#### Responsive Design
- [ ] Mobile responsive (test on 375px width)
- [ ] Tablet responsive (test on 768px width)
- [ ] Desktop responsive (test on 1920px width)

#### Visual Verification
- [ ] All cards render correctly on all screen sizes
- [ ] Accordion expands/collapses smoothly
- [ ] Icons display correctly (lucide-react)
- [ ] Colors match design system
- [ ] Badges display properly
- [ ] Typography is readable

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Screen reader friendly (test with VoiceOver/NVDA)
- [ ] ARIA labels present where needed
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus indicators visible
- [ ] Accordion keyboard accessible

## Test Commands

```bash
# Type check
npm run type-check

# Build (must succeed)
npm run build

# Run synthesis tests
npm run test:synthesis

# Run component tests
npm run test:components

# Run template formatter tests
npm run test:template-formatter
```

## Deployment Steps

### 1. Create Feature Branch

```bash
git checkout -b feature/synthesis-v3
git add .
git commit -m "feat: Implement synthesis v3 with query type classification

- Add query type classification (informational, decision-required, validation, comparison)
- Create 6 card components for different response types
- Implement BunkerResponseViewer orchestrator component
- Add template system with conditional rendering
- Create synthesis filtering logic
- Add performance monitoring module"

git push origin feature/synthesis-v3
```

### 2. Create Pull Request

- Title: `feat: Synthesis v3 with Query Type Classification`
- Description: Include summary of changes and test results
- Request reviews from team members
- Ensure CI/CD pipeline passes

### 3. Staging Deployment

```bash
# Deploy to staging
npm run build
# (Use your deployment command for staging)
```

#### Staging Verification
- [ ] Deploy to staging environment
- [ ] Run smoke tests (3 queries per type = 12 total)
- [ ] Monitor synthesis error rate (<5%)
- [ ] Monitor synthesis latency (<2s P95)
- [ ] Check CloudWatch/Datadog logs
- [ ] Test on multiple browsers (Chrome, Firefox, Safari)

### 4. Feature Flag Setup (Optional)

```typescript
// In lib/feature-flags.ts
export const FEATURE_FLAGS = {
  USE_SYNTHESIS_V3: process.env.NEXT_PUBLIC_USE_SYNTHESIS_V3 === 'true',
  SHOW_SYNTHESIS_DEBUG: process.env.NODE_ENV === 'development',
};
```

### 5. Production Rollout (Gradual)

#### Phase 1: 10% Traffic
- [ ] Enable for 10% of users
- [ ] Monitor for 24 hours
- [ ] Check error rates (<5%)
- [ ] Check latency (<2s P95)
- [ ] Review user feedback

#### Phase 2: 50% Traffic
- [ ] Enable for 50% of users
- [ ] Monitor for 24 hours
- [ ] Check query type classification accuracy
- [ ] Review any support tickets

#### Phase 3: 100% Traffic
- [ ] Enable for 100% of users
- [ ] Continue monitoring
- [ ] Document any issues

### 6. Monitoring Setup

#### CloudWatch Dashboard
- [ ] Synthesis latency (avg, P50, P95, P99)
- [ ] Synthesis error rate
- [ ] Query type distribution
- [ ] Cost per query
- [ ] Details surfacing rate

#### Alerts
- [ ] Alert: Synthesis error rate >10%
- [ ] Alert: Synthesis latency >3 seconds (P95)
- [ ] Alert: Synthesis cost >$0.01 per query
- [ ] Alert: Classification accuracy <85%

## Rollback Plan

### Rollback Triggers
- Synthesis accuracy <85%
- Synthesis latency >3 seconds P95
- Synthesis cost >$0.01 per query
- Critical bugs reported by >5 users
- Error rate >10%

### Rollback Steps

1. **Immediate**: Set feature flag to false (if using feature flags)
   ```bash
   # Update environment variable
   NEXT_PUBLIC_USE_SYNTHESIS_V3=false
   ```

2. **Code Rollback**: Deploy previous version
   ```bash
   git revert HEAD
   git push origin main
   # Trigger deployment
   ```

3. **Verification**: Confirm old system working
   - [ ] Run smoke tests on production
   - [ ] Verify no errors in logs
   - [ ] Check user-facing functionality

4. **Post-Mortem**
   - [ ] Investigate root cause
   - [ ] Document findings
   - [ ] Create fix and re-test

## Success Metrics (30 days post-launch)

### Technical Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Query type classification accuracy | >90% | Manual review of 100 samples |
| Synthesis latency (P95) | <2 seconds | CloudWatch metrics |
| Synthesis cost per query | <$0.005 | Token tracking |
| Error rate | <5% | Error logging |
| Response time (end-to-end) | <15 seconds | RUM metrics |

### User Experience Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| User time-to-decision | <30 seconds | Session analytics |
| Detail expansion rate | <30% | Click tracking |
| User confidence score | >80% | User surveys |
| Information overload rating | <3/10 | User surveys |

### Business Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Decision accuracy | >95% | Outcome tracking |
| System adoption | >85% | Usage analytics |
| User satisfaction | Improved | NPS scores |
| Support ticket reduction | >20% | Support system |

## Frontend Project Structure

```
frontend/
├── app/                         # Next.js App Router
│   ├── api/                     # API routes
│   │   ├── chat/                # Basic chat endpoint
│   │   ├── chat-langgraph/      # LangGraph-based chat
│   │   ├── chat-multi-agent/    # Multi-agent orchestration
│   │   ├── chat-ab/             # A/B testing endpoint
│   │   ├── monitoring/          # Performance monitoring
│   │   ├── template-preferences/# Template preference API
│   │   └── test-*/              # Test endpoints (weather, etc.)
│   ├── chat/                    # Chat page
│   ├── chat-langgraph/          # LangGraph chat page
│   ├── chat-multi-agent/        # Multi-agent chat page
│   ├── analytics/               # Analytics dashboard
│   └── compare/                 # Implementation comparison page
├── components/                  # React components
│   ├── cards/                   # Response card components
│   │   ├── comparison-result-card.tsx
│   │   ├── executive-decision-card.tsx
│   │   ├── informational-response-card.tsx
│   │   ├── priority-card.tsx
│   │   ├── risk-alert-card.tsx
│   │   ├── validation-result-card.tsx
│   │   └── __tests__/           # Card tests
│   ├── template-response/       # Template-based response rendering
│   ├── ui/                      # Shadcn UI components
│   ├── bunker-response-viewer.tsx
│   ├── chat-interface-multi-agent.tsx
│   ├── map-viewer.tsx
│   ├── weather-card.tsx
│   └── voyage-timeline.tsx
├── lib/                         # Core libraries
│   ├── config/                  # Configuration loaders
│   │   ├── feature-flags.ts
│   │   ├── synthesis-config-loader.ts
│   │   ├── template-loader.ts
│   │   └── template-preferences.ts
│   ├── data/                    # Static data
│   │   ├── ports.json
│   │   ├── prices.json
│   │   ├── vessels.json
│   │   └── cached-routes.json
│   ├── engines/                 # Business logic engines
│   │   ├── capacity-validation-engine.ts
│   │   ├── eca-consumption-engine.ts
│   │   ├── multi-port-bunker-planner.ts
│   │   ├── rob-tracking-engine.ts
│   │   ├── safety-margin-engine.ts
│   │   └── weather-adjustment-engine.ts
│   ├── formatters/              # Response formatters
│   │   ├── content-extractors.ts
│   │   ├── insight-extractor.ts
│   │   ├── response-formatter.ts
│   │   ├── synthesis-renderers.ts
│   │   └── template-aware-formatter.ts
│   ├── multi-agent/             # Multi-agent orchestration
│   │   ├── synthesis/           # Response synthesis
│   │   │   ├── synthesis-engine.ts
│   │   │   ├── synthesis-prompts.ts
│   │   │   └── synthesis-metrics.ts
│   │   ├── agent-nodes.ts
│   │   ├── execution-planner.ts
│   │   ├── intent-analyzer.ts
│   │   ├── supervisor-planner.ts
│   │   └── state.ts
│   ├── registry/                # Registries
│   │   ├── agent-registry.ts
│   │   ├── tool-registry.ts
│   │   └── workflow-registry.ts
│   ├── tools/                   # Agent tools
│   │   ├── bunker-analyzer.ts
│   │   ├── marine-weather.ts
│   │   ├── port-finder.ts
│   │   ├── price-fetcher.ts
│   │   ├── route-calculator.ts
│   │   ├── weather-consumption.ts
│   │   ├── weather-timeline.ts
│   │   └── port-weather.ts
│   ├── utils/                   # Utilities
│   │   ├── ab-testing.ts
│   │   ├── debug-logger.ts
│   │   ├── feature-flags.ts
│   │   └── performance.ts
│   └── validators/              # Input validation
├── config/                      # YAML configurations
│   ├── agents/                  # Agent configs
│   ├── validation-rules/        # Validation rules
│   └── workflows/               # Workflow definitions
└── tests/                       # Test suites
    ├── integration/             # Integration tests
    ├── unit/                    # Unit tests
    └── synthesis-test-queries.ts
```

## Files Changed

### Key Frontend Components
- `frontend/components/cards/` - 6 response card components
- `frontend/components/ui/accordion.tsx` - Accordion component
- `frontend/components/ui/alert.tsx` - Alert component
- `frontend/components/bunker-response-viewer.tsx` - Main response viewer
- `frontend/components/weather-card.tsx` - Weather display card
- `frontend/components/voyage-timeline.tsx` - Voyage timeline visualization

### Multi-Agent System
- `frontend/lib/multi-agent/state.ts` - Agent state management
- `frontend/lib/multi-agent/synthesis/synthesis-engine.ts` - Response synthesis
- `frontend/lib/multi-agent/synthesis/synthesis-prompts.ts` - Prompt loading
- `frontend/lib/multi-agent/execution-planner.ts` - Execution planning
- `frontend/lib/multi-agent/intent-analyzer.ts` - Query classification
- `frontend/lib/multi-agent/supervisor-planner.ts` - Agent orchestration

### Formatters
- `frontend/lib/formatters/template-aware-formatter.ts` - Template-based formatting
- `frontend/lib/formatters/synthesis-renderers.ts` - Rendering logic
- `frontend/lib/config/template-loader.ts` - Template configuration

### Test Suites
- `frontend/tests/synthesis-test-queries.ts` - Synthesis test suite
- `frontend/lib/multi-agent/__tests__/query-test.ts` - Query tests
- `frontend/components/cards/__tests__/cards.test.ts` - Card component tests

## Dependencies (frontend/package.json)
- `@radix-ui/react-accordion` - Expandable sections
- `@radix-ui/react-scroll-area` - Scroll containers
- `@langchain/langgraph` - LangGraph framework
- `@langchain/anthropic` - Claude integration
- `recharts` - Data visualization
- `react-leaflet` - Map visualization
- `zod` - Schema validation
- `yaml` - YAML parsing
- `@types/jest` - TypeScript test definitions

## Contact

For issues during deployment:
- Technical Lead: [Name]
- On-Call: [Rotation schedule]
- Slack: #synthesis-v3-deployment
