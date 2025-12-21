# A/B Testing Framework Guide

## Overview

The A/B testing framework allows you to compare single-agent vs multi-agent performance, track metrics, and make data-driven decisions about which system to use.

## Features

1. **Traffic Routing**: Routes percentage of traffic to multi-agent endpoint
2. **Metrics Tracking**: Tracks response time, success rate, cost, satisfaction, accuracy
3. **Analytics Dashboard**: Visual comparison of both variants
4. **Feature Flags**: Enable/disable multi-agent per user with gradual rollout
5. **Data-Driven Recommendations**: Automatic recommendation based on metrics

## Configuration

### Environment Variables

```bash
# Enable/disable A/B testing
AB_TEST_ENABLED=true

# Percentage of traffic to multi-agent (0-100)
AB_TEST_MULTI_AGENT_PERCENTAGE=50

# Gradual rollout (consistent user assignment)
AB_TEST_GRADUAL_ROLLOUT=true

# Feature flag: Multi-agent enabled
MULTI_AGENT_ENABLED=true

# Feature flag: Rollout percentage
FEATURE_MULTI_AGENT_ROLLOUT=100

# Feature flag: User whitelist
FEATURE_MULTI_AGENT_USER_IDS=user1,user2

# Feature flag: User blacklist
FEATURE_MULTI_AGENT_EXCLUDE_USER_IDS=user3,user4
```

## Usage

### 1. Using A/B Test Endpoint

Route requests through the A/B test endpoint:

```typescript
const response = await fetch('/api/chat-ab', {
  method: 'POST',
  body: JSON.stringify({
    message: 'Find route from Singapore to Rotterdam',
    userId: 'user123', // Optional: for consistent assignment
    sessionId: 'session456', // Optional: for consistent assignment
  }),
});
```

The endpoint will:
- Determine variant based on configuration
- Route to appropriate endpoint
- Track metrics automatically
- Return response with A/B test metadata

### 2. Direct Endpoint Usage

You can also call endpoints directly and track manually:

```typescript
import { recordABTestResult } from '@/lib/utils/ab-testing';

const startTime = Date.now();
const response = await fetch('/api/chat-multi-agent', { ... });
const duration = Date.now() - startTime;

recordABTestResult({
  variant: 'multi-agent',
  responseTime: duration,
  success: response.ok,
  cost: 0.001, // Estimated cost
});
```

### 3. Recording User Satisfaction

After receiving a response, record user satisfaction:

```typescript
import { recordUserSatisfaction } from '@/lib/utils/ab-testing';

// From frontend
await fetch('/api/ab-test', {
  method: 'POST',
  body: JSON.stringify({
    requestId: response.ab_test.request_id,
    satisfaction: 5, // 1-5 scale
    accuracy: 0.95, // 0-1 scale (optional)
  }),
});
```

## Analytics Dashboard

Access the analytics dashboard at `/analytics` to view:

- **Performance Comparison**: Response times, success rates
- **Cost Analysis**: Average cost per request
- **Quality Metrics**: User satisfaction, accuracy
- **Improvement Summary**: Percentage improvements
- **Recommendation**: Data-driven recommendation

## Metrics Tracked

### Response Time
- Average response time
- Median response time
- P95 and P99 percentiles

### Success Rate
- Total requests
- Successful requests
- Failed requests
- Success rate percentage

### Cost
- Total cost
- Average cost per request
- Cost comparison

### Quality
- User satisfaction (1-5 scale)
- Accuracy (0-1 scale)

### Cache Performance
- Cache hit rate

## Recommendation Algorithm

The system automatically recommends the best variant based on:

1. **Response Time** (30% weight): Lower is better
2. **Success Rate** (25% weight): Higher is better
3. **Cost** (20% weight): Lower is better
4. **Satisfaction** (15% weight): Higher is better
5. **Accuracy** (10% weight): Higher is better

Recommendation is "inconclusive" if:
- Less than 10 requests per variant
- Scores are within 5 points of each other

## Feature Flags

### Per-User Enablement

Enable multi-agent for specific users:

```bash
FEATURE_MULTI_AGENT_USER_IDS=user1,user2,user3
```

### Gradual Rollout

Roll out to percentage of users:

```bash
FEATURE_MULTI_AGENT_ROLLOUT=25  # 25% of users
```

### User Exclusion

Exclude specific users:

```bash
FEATURE_MULTI_AGENT_EXCLUDE_USER_IDS=user4,user5
```

## API Endpoints

### GET /api/ab-test?action=comparison
Returns comparison of both variants with recommendation.

### GET /api/ab-test?action=metrics&variant=single-agent
Returns metrics for a specific variant.

### GET /api/ab-test?action=results&limit=100
Returns recent test results.

### GET /api/ab-test?action=config
Returns A/B test configuration.

### POST /api/ab-test
Records user satisfaction for a request.

## Best Practices

1. **Start Small**: Begin with 10-20% traffic to multi-agent
2. **Monitor Closely**: Check analytics dashboard daily
3. **Collect Feedback**: Record user satisfaction
4. **Gradual Increase**: Increase percentage as confidence grows
5. **Data-Driven**: Make decisions based on metrics, not assumptions

## Example Workflow

1. **Week 1**: Enable A/B testing with 10% multi-agent traffic
2. **Monitor**: Check analytics daily, ensure no issues
3. **Week 2**: Increase to 25% if metrics are positive
4. **Week 3**: Increase to 50% if still positive
5. **Week 4**: Increase to 100% if recommendation is multi-agent
6. **Finalize**: Disable A/B testing, use multi-agent as default

## Troubleshooting

### No Data in Dashboard
- Ensure A/B testing is enabled
- Check that requests are going through `/api/chat-ab`
- Verify environment variables are set

### Inconclusive Recommendation
- Need at least 10 requests per variant
- Wait for more data collection
- Check if metrics are too close

### Inconsistent Assignment
- Enable `AB_TEST_GRADUAL_ROLLOUT=true`
- Provide `userId` or `sessionId` in requests
- Check hash function is working correctly

## Data Retention

- Test results are kept in memory (last 10,000 results)
- For production, consider using a database
- Metrics are calculated in real-time
- Historical data can be exported via API

## Security

- A/B test endpoint can be secured with authentication
- User IDs should be hashed for privacy
- Don't log sensitive user data
- Consider rate limiting for API endpoints

