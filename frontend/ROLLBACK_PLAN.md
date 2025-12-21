# Rollback Plan for Multi-Agent System

This document outlines the rollback procedure in case issues are detected after deployment.

## Rollback Strategy

The multi-agent system is designed with backward compatibility in mind. The old endpoints remain active, allowing for graceful rollback if needed.

## Rollback Scenarios

### Scenario 1: Critical Error in Multi-Agent System

**Symptoms:**
- Multi-agent endpoint returns errors
- High error rate (>5%)
- System instability

**Rollback Steps:**

1. **Immediate Action** (0-5 minutes):
   ```bash
   # Option A: Revert deployment in Netlify Dashboard
   # - Go to Netlify Dashboard > Deploys
   # - Find previous successful deployment
   # - Click "Publish deploy" to rollback
   
   # Option B: Git revert and redeploy
   git revert HEAD
   git push origin main
   ```

2. **Verify Rollback**:
   - Check that old endpoints still work:
     - `/api/chat` ✅
     - `/api/chat-langgraph` ✅
   - Verify UI pages load correctly
   - Test a sample query

3. **Notify Users** (if applicable):
   - Update status page
   - Communicate via support channels

### Scenario 2: Performance Degradation

**Symptoms:**
- Response times >90 seconds
- High memory usage
- Timeout errors

**Rollback Steps:**

1. **Disable Multi-Agent Endpoint** (5-10 minutes):
   - Option A: Return 503 in `/api/chat-multi-agent/route.ts`:
     ```typescript
     return new Response(
       JSON.stringify({ error: 'Service temporarily unavailable' }),
       { status: 503 }
     );
     ```
   - Option B: Redirect to old endpoint in UI

2. **Monitor Old Endpoints**:
   - Verify `/api/chat-langgraph` handles load
   - Check response times
   - Monitor error rates

3. **Investigate Root Cause**:
   - Review performance metrics
   - Check logs for bottlenecks
   - Identify specific agent/tool causing issues

### Scenario 3: Partial Functionality Issue

**Symptoms:**
- One agent failing
- Specific tool errors
- Data inconsistency

**Rollback Steps:**

1. **Selective Disable** (10-15 minutes):
   - Modify supervisor to skip problematic agent
   - Or: Return cached/fallback data for specific agent

2. **Gradual Rollback**:
   - Keep working agents active
   - Disable only problematic components
   - Monitor impact

3. **Fix and Redeploy**:
   - Fix issue in development
   - Test thoroughly
   - Redeploy with fix

## Rollback Procedures

### Quick Rollback (Netlify Dashboard)

1. Log into Netlify Dashboard
2. Navigate to your site
3. Go to **Deploys** tab
4. Find the previous successful deployment
5. Click **"..."** menu → **"Publish deploy"**
6. Confirm rollback
7. Verify site is working

**Time to Rollback**: ~2-5 minutes

### Git-Based Rollback

```bash
# 1. Identify the commit to rollback to
git log --oneline

# 2. Revert to previous commit
git revert HEAD
# Or: git reset --hard <previous-commit-sha>

# 3. Push to trigger new deployment
git push origin main

# 4. Monitor deployment in Netlify
```

**Time to Rollback**: ~5-10 minutes

### Code-Based Rollback (Feature Flag)

If you've implemented feature flags:

```typescript
// In route.ts
const MULTI_AGENT_ENABLED = process.env.MULTI_AGENT_ENABLED !== 'false';

if (!MULTI_AGENT_ENABLED) {
  // Fallback to old endpoint
  return await handleLegacyRequest(req);
}
```

**Time to Rollback**: ~1-2 minutes (just update env var)

## Post-Rollback Verification

After rolling back, verify:

- [ ] Old endpoints respond correctly
- [ ] UI pages load without errors
- [ ] Sample queries execute successfully
- [ ] Error rates return to normal
- [ ] Performance metrics stable
- [ ] No data loss occurred

## Communication Plan

### Internal Team

1. **Immediate** (0-5 min):
   - Notify team via Slack/email
   - Share rollback status
   - Assign investigation owner

2. **Follow-up** (1 hour):
   - Root cause analysis
   - Timeline for fix
   - Prevention measures

### External Users (if applicable)

1. **Status Page Update**:
   - Mark service as "degraded" or "down"
   - Provide estimated resolution time

2. **Support Channels**:
   - Update FAQ with known issues
   - Prepare support responses

## Prevention Measures

To minimize rollback risk:

1. **Staging Environment**:
   - Deploy to staging first
   - Test thoroughly before production

2. **Gradual Rollout**:
   - Enable for subset of users
   - Monitor metrics
   - Gradually increase traffic

3. **Feature Flags**:
   - Implement feature flags for easy disable
   - Allow per-user or percentage-based rollout

4. **Monitoring**:
   - Set up alerts for error rates
   - Monitor performance metrics
   - Track API costs

5. **Testing**:
   - Comprehensive test suite
   - Load testing
   - Chaos engineering (optional)

## Rollback Checklist

When executing a rollback:

- [ ] Identify rollback method (Dashboard/Git/Code)
- [ ] Execute rollback
- [ ] Verify old endpoints work
- [ ] Test sample queries
- [ ] Check error logs
- [ ] Monitor metrics
- [ ] Notify team
- [ ] Document incident
- [ ] Plan fix and redeploy

## Recovery Plan

After rollback, plan recovery:

1. **Investigation** (1-2 hours):
   - Review error logs
   - Analyze performance metrics
   - Identify root cause

2. **Fix Development** (2-4 hours):
   - Implement fix
   - Add tests
   - Local verification

3. **Staging Deployment** (1 hour):
   - Deploy to staging
   - Run test suite
   - Verify fix

4. **Production Redeploy** (30 min):
   - Deploy to production
   - Monitor closely
   - Verify success

## Contact Information

**On-Call Engineer**: [Contact Info]
**DevOps Team**: [Contact Info]
**Project Lead**: [Contact Info]

## Last Updated

**Date**: [Current Date]
**Version**: 1.0
**Reviewed By**: [Name]

---

**Remember**: It's better to rollback quickly than to let issues persist. Don't hesitate to rollback if you're unsure.

