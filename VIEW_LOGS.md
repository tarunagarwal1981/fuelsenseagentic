# How to View Server-Side Logs in Netlify

## Method 1: Netlify Dashboard (Easiest)

### View Function Logs (Real-time)

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site (`fuelsensebot`)
3. Go to **Functions** tab (in the left sidebar)
4. Click on **View logs** button
5. You'll see real-time function execution logs

### View Deploy Logs

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Deploys** tab
4. Click on the latest deploy
5. Scroll down to see **Function logs** section
6. Look for logs with `[MANUAL-API]` or `[API]` prefixes

## Method 2: Netlify CLI (For Developers)

### Install Netlify CLI
```bash
npm install -g netlify-cli
```

### Login
```bash
netlify login
```

### View Function Logs
```bash
# View real-time function logs
netlify logs:functions

# View logs for a specific function
netlify logs:functions --function chat

# Follow logs (like tail -f)
netlify logs:functions --follow
```

## What to Look For

### Manual Implementation Logs
Look for logs with `[MANUAL-API]` prefix:
- `🤖 [MANUAL-API] Agent started`
- `🔄 [MANUAL-API] Loop iteration`
- `🔧 [MANUAL-API] Executing tool`
- `📊 [MANUAL-API] Data completeness check`
- `⚠️ [MANUAL-API] Only have route data - forcing continuation`
- `🔄 [MANUAL-API] Added follow-up message`

### LangGraph Implementation Logs
Look for logs with `[API]` prefix:
- `🚀 [API] Starting graph stream`
- `🧠 [AGENT] Node: LLM making decision`
- `🔀 [ROUTER] Decision point`
- `🔄 [REDUCER] Node: Processing tool results`

## Troubleshooting

### If logs are empty:
1. Make sure you've triggered a request (submit a chat message)
2. Wait a few seconds for logs to appear
3. Check if the function is actually being called (check Network tab in browser)

### If you see errors:
- Look for `❌ [MANUAL-API]` or `❌ [API]` prefixes
- Check for stack traces
- Verify environment variables are set correctly

### If continuation logic isn't working:
- Look for `📊 [MANUAL-API] Data completeness check` log
- Check if `hasRouteOnly`, `hasRouteAndPorts`, etc. are being detected
- Verify `🔄 [MANUAL-API] Added follow-up message` appears

## Quick Access

**Direct link to your site's functions:**
- Replace `YOUR_SITE_NAME` with your actual site name
- https://app.netlify.com/sites/YOUR_SITE_NAME/functions

**Direct link to your site's deploys:**
- https://app.netlify.com/sites/YOUR_SITE_NAME/deploys

