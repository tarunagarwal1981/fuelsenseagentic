# Netlify Environment Variables Setup

## Problem: "Load failed" / Network Error

If you're seeing network errors when using the chat interface, it's likely because **environment variables are not set in Netlify**.

## Required Environment Variables

### 1. ANTHROPIC_API_KEY (REQUIRED)

This is **critical** - without it, the API routes will fail.

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

### 2. Optional Environment Variables

These are optional but recommended:

- **LANGCHAIN_API_KEY**: For LangSmith monitoring
  - Get from: https://smith.langchain.com
  - Value format: `lsv2_pt_...`

- **LANGCHAIN_TRACING_V2**: Enable tracing
  - Value: `true`

- **LANGCHAIN_PROJECT**: Project name for LangSmith
  - Value: `fuelsense-360`

- **LLM_MODEL**: Model to use (optional, defaults to `claude-haiku-4-5-20251001`)
  - Value: `claude-haiku-4-5-20251001` (or other Claude model)

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

- [ ] `ANTHROPIC_API_KEY` is set in Netlify
- [ ] Variable is set for "All scopes" or at least "Production"
- [ ] Site has been redeployed after setting variables
- [ ] Build logs show no errors
- [ ] Chat interface works (no network errors)

