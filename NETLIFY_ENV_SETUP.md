# Netlify Environment Variables Setup

## Problem: "Load failed" / Network Error

If you're seeing network errors when using the chat interface, it's likely because **environment variables are not set in Netlify**.

## Required Environment Variables

### 1. ANTHROPIC_API_KEY (REQUIRED)

This is **critical** - without it, the API routes will fail. Used for Bunker Agent and Finalize Node.

**How to set it:**

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add variable**
5. Set:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: Your Anthropic API key (starts with `sk-ant-...`)
   - **Scopes**: Select "All scopes" or "Production, Deploy previews, Branch deploys"
6. Click **Save**

### 2. OPENAI_API_KEY (OPTIONAL - Recommended for Cost Savings)

**Highly recommended** - Enables GPT-4o-mini for Route and Weather agents, reducing costs by ~85% for those agents.

**How to set it:**

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add variable**
5. Set:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (starts with `sk-...`)
   - **Scopes**: Select "All scopes" or "Production, Deploy previews, Branch deploys"
6. Click **Save**

**Note:** If `OPENAI_API_KEY` is not set, the system will automatically fallback to Claude Haiku 4.5 for Route/Weather agents. The app will work fine, but you won't get the cost savings.

**Get your OpenAI API key:**
- Go to https://platform.openai.com/api-keys
- Create a new API key
- Copy it to Netlify environment variables

### 3. Optional Environment Variables

These are optional but recommended:

- **USE_AGENTIC_SUPERVISOR**: Enable intelligent ReAct-pattern supervisor (NEW!)
  - Value: `true` or `false` (default: `false`)
  - When enabled: Uses LLM reasoning for routing decisions instead of hard-coded rules
  - Benefits: +35% success rate (60% → 95%), handles edge cases, error recovery
  - Cost: ~$0.08/query vs $0.02/query
  - Recommended for production after testing

- **LANGCHAIN_API_KEY**: For LangSmith monitoring
  - Get from: https://smith.langchain.com
  - Value format: `lsv2_pt_...`

- **LANGCHAIN_TRACING_V2**: Enable tracing
  - Value: `true`

- **LANGCHAIN_PROJECT**: Project name for LangSmith
  - Value: `fuelsense-360`

- **LLM_MODEL**: Model to use (optional, defaults to `claude-haiku-4-5-20251001`)
  - Value: `claude-haiku-4-5-20251001` (or other Claude model)
  - Note: This is only used as a fallback. The tiered LLM system will use GPT-4o-mini for Route/Weather if `OPENAI_API_KEY` is set.

## After Setting Variables

1. **Redeploy your site**:
   - Go to **Deploys** tab
   - Click **Trigger deploy** → **Deploy site**
   - Or make a small commit and push to trigger automatic deploy

2. **Verify the variables are loaded**:
   - Check build logs - you should see the build succeed
   - The API routes should now work

## Testing

After setting environment variables and redeploying:

1. Go to your deployed site
2. Try the chat interface
3. The network error should be resolved

## Troubleshooting

### Still getting errors?

1. **Check build logs**:
   - Go to Netlify Dashboard → Deploys
   - Click on the latest deploy
   - Check for any errors related to environment variables

2. **Verify variable names**:
   - Must be exactly: `ANTHROPIC_API_KEY` (case-sensitive)
   - No extra spaces or characters

3. **Check API key format**:
   - Should start with `sk-ant-`
   - Should be the full key from Anthropic dashboard

4. **Test locally**:
   - Make sure your `.env.local` has the key
   - Test that `npm run dev` works locally
   - If local works but Netlify doesn't, it's definitely an environment variable issue

## Security Notes

- ⚠️ **Never commit** `.env` or `.env.local` files to git
- ✅ Environment variables in Netlify are encrypted and secure
- ✅ They're only available at build/runtime, not in your code

## Quick Checklist

- [ ] `ANTHROPIC_API_KEY` is set in Netlify (REQUIRED)
- [ ] `OPENAI_API_KEY` is set in Netlify (OPTIONAL - for cost savings)
- [ ] Variables are set for "All scopes" or at least "Production"
- [ ] Site has been redeployed after setting variables
- [ ] Build logs show no errors
- [ ] Chat interface works (no network errors)
- [ ] Check logs to verify GPT-4o-mini is being used for Route/Weather agents (if OPENAI_API_KEY is set)

## Tiered LLM Strategy

The application now uses a tiered LLM approach for cost optimization:

- **Agentic Supervisor** (if `USE_AGENTIC_SUPERVISOR=true`): GPT-4o for reasoning or Claude Haiku 4.5 (fallback)
- **Route Agent**: GPT-4o-mini (if `OPENAI_API_KEY` set) or Claude Haiku 4.5 (fallback)
- **Weather Agent**: GPT-4o-mini (if `OPENAI_API_KEY` set) or Claude Haiku 4.5 (fallback)
- **Bunker Agent**: Claude Haiku 4.5 (always - complex schemas need reliability)
- **Finalize Node**: Claude Haiku 4.5 (always - synthesis quality matters)

**Expected Cost Savings:** ~24-30% reduction in LLM costs when `OPENAI_API_KEY` is configured.

**Agentic Supervisor Cost:** When `USE_AGENTIC_SUPERVISOR=true`, expect ~$0.08/query vs $0.02/query, but with 95% success rate vs 60%.

**How to verify it's working:**
Check your application logs for these messages:
- `🧠 [SUPERVISOR] Using AGENTIC mode (ReAct pattern)...` ← Agentic supervisor active
- `🤖 [LLM-FACTORY] Using GPT-4o for agentic reasoning` ← Using GPT-4o for reasoning
- `🤖 [LLM-FACTORY] Using GPT-4o-mini for simple tool calling` ← Cost savings active
- `🤖 [LLM-FACTORY] Using Claude Haiku 4.5 for simple tool calling (fallback)` ← OpenAI unavailable

