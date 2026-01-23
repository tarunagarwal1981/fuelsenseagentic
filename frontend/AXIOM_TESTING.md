# Axiom Connection Test Guide

## Step 1: Authenticate with Axiom CLI

If you haven't authenticated yet, run:

```bash
axiom auth login
```

This will prompt you to paste your Axiom API token. You can get your token from:
- Axiom Dashboard → Settings → API Tokens
- Or use your existing `AXIOM_TOKEN` environment variable

## Step 2: Verify Authentication

```bash
axiom auth status
```

Should show your authenticated organization and user.

## Step 3: Test Log Streaming

Stream live logs from the `fuelsense-production` dataset:

```bash
axiom stream fuelsense-production
```

This will show real-time logs as they're ingested. To test, you can:
1. Run a query through the multi-agent system
2. Watch the logs appear in the stream

## Step 4: Query Recent Logs

Query logs from the last hour:

```bash
axiom query fuelsense-production --start-time="1h ago" --end-time="now"
```

Or query with a specific filter:

```bash
axiom query fuelsense-production --start-time="1h ago" --end-time="now" '["tool_call"]'
```

## Step 5: Verify Log Structure

Check that logs include correlation IDs:

```bash
axiom query fuelsense-production --start-time="1h ago" --end-time="now" '["correlation_id"] | head 10'
```

## Environment Variables

Make sure these are set in your `.env.local`:

```bash
AXIOM_TOKEN=your_token_here
AXIOM_DATASET=fuelsense-production  # Optional, defaults to fuelsense-production
AXIOM_ORG_ID=your_org_id  # Optional, only needed for some setups
```

## Testing Log Ingestion

To test that logs are being sent:

1. **Run a test query:**
   ```bash
   cd frontend
   npm run test:infrastructure
   ```

2. **Stream logs in another terminal:**
   ```bash
   axiom stream fuelsense-production
   ```

3. **You should see logs appearing with:**
   - `correlation_id` field
   - `tool` field (for tool calls)
   - `agent` field (for agent executions)
   - `circuit_event` field (for circuit breaker events)
   - `retry_attempt` field (for retry events)

## Troubleshooting

If logs aren't appearing:

1. **Check AXIOM_TOKEN is set:**
   ```bash
   echo $AXIOM_TOKEN
   ```

2. **Check dataset exists:**
   ```bash
   axiom dataset list
   ```

3. **Check for errors in application logs:**
   Look for `[axiom] Error:` messages in your application output

4. **Verify token permissions:**
   Your token needs `ingest` permission for the dataset

## Example Queries

**Find all circuit breaker events:**
```bash
axiom query fuelsense-production --start-time="1h ago" '["circuit_event"]'
```

**Find all retry attempts:**
```bash
axiom query fuelsense-production --start-time="1h ago" '["retry_attempt"]'
```

**Find errors for a specific correlation ID:**
```bash
axiom query fuelsense-production --start-time="1h ago" 'correlation_id == "your-correlation-id"'
```

**Count tool calls by tool name:**
```bash
axiom query fuelsense-production --start-time="1h ago" '["tool_name"] | summarize count() by tool_name'
```
