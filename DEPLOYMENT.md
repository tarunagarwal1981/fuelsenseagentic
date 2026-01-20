# Netlify Deployment Guide for FuelSense 360

This guide explains how to deploy the FuelSense 360 frontend application to Netlify.

## Project Structure

```
FuelSense/
├── frontend/                    # Next.js application (deployment target)
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # API routes
│   │   │   ├── chat/            # Basic chat endpoint
│   │   │   ├── chat-langgraph/  # LangGraph-based chat
│   │   │   ├── chat-multi-agent/# Multi-agent orchestration
│   │   │   └── monitoring/      # Performance monitoring
│   │   ├── chat/                # Chat page
│   │   ├── chat-multi-agent/    # Multi-agent chat page
│   │   └── analytics/           # Analytics dashboard
│   ├── components/              # React components
│   │   ├── cards/               # Response card components
│   │   ├── template-response/   # Template rendering
│   │   └── ui/                  # Shadcn UI components
│   ├── lib/                     # Core libraries
│   │   ├── config/              # Configuration loaders
│   │   ├── data/                # Static data (ports, prices, vessels)
│   │   ├── engines/             # Business logic engines
│   │   ├── formatters/          # Response formatters
│   │   ├── multi-agent/         # Multi-agent orchestration
│   │   ├── registry/            # Agent/tool registries
│   │   ├── tools/               # Agent tools
│   │   └── validators/          # Input validation
│   ├── config/                  # YAML configurations
│   │   ├── agents/              # Agent configs
│   │   └── workflows/           # Workflow definitions
│   ├── tests/                   # Test suites
│   ├── package.json             # Frontend dependencies
│   └── netlify.toml             # Netlify config (frontend)
├── config/                      # Root-level configurations
│   ├── prompts/                 # LLM prompts
│   └── response-templates/      # Response templates
└── netlify.toml                 # Netlify configuration (root level)
```

## Deployment Steps

### Option 1: Deploy via Netlify Dashboard (Recommended)

1. **Connect Repository**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository (GitHub/GitLab/Bitbucket)

2. **Configure Build Settings**
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/.next`
   - **Node version**: `18` (or higher)

3. **Set Environment Variables**
   Go to Site settings → Environment variables and add:
   
   **Required:**
   - `ANTHROPIC_API_KEY` - Your Anthropic API key
   
   **Optional:**
   - `LANGCHAIN_API_KEY` - LangSmith API key (for monitoring)
   - `LANGCHAIN_TRACING_V2` - Set to `true` to enable tracing
   - `LANGCHAIN_PROJECT` - Project name (e.g., `fuelsense-360`)
   - `LLM_MODEL` - Model to use (defaults to `claude-haiku-4-5-20251001`)

4. **Deploy**
   - Click "Deploy site"
   - Netlify will automatically build and deploy your site

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Site**
   ```bash
   cd frontend
   netlify init
   ```
   - Follow the prompts to link your site
   - Select "Create & configure a new site"

4. **Set Environment Variables**
   ```bash
   netlify env:set ANTHROPIC_API_KEY "your-key-here"
   netlify env:set LANGCHAIN_API_KEY "your-key-here"  # Optional
   netlify env:set LANGCHAIN_TRACING_V2 "true"        # Optional
   netlify env:set LANGCHAIN_PROJECT "fuelsense-360"  # Optional
   ```

5. **Deploy**
   ```bash
   netlify deploy --prod
   ```

## Configuration Files

### Root `netlify.toml`
Located at the repository root, this file tells Netlify:
- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `frontend/.next`
- Node version: `18`

### Frontend `netlify.toml` (Legacy)
The `frontend/netlify.toml` file is kept for reference but the root-level config takes precedence.

## Build Process

1. Netlify changes to the `frontend` directory
2. Runs `npm install` to install dependencies
3. Runs `npm run build` to build the Next.js application
4. Publishes the `.next` output directory
5. The `@netlify/plugin-nextjs` plugin handles Next.js-specific optimizations

## Troubleshooting

### Build Fails with "Module not found"
- Ensure all dependencies are in `frontend/package.json`
- Check that `node_modules` is not in `.gitignore` (it shouldn't be)

### Environment Variables Not Working
- Verify variables are set in Netlify Dashboard
- Check variable names match exactly (case-sensitive)
- Redeploy after adding new variables

### Edge Runtime Errors
- Some Next.js features require Node.js runtime
- API routes using `export const runtime = "edge"` should work on Netlify

### Build Timeout
- Netlify free tier has a 15-minute build timeout
- If builds are slow, consider optimizing dependencies or upgrading

## Post-Deployment

1. **Test Your Site**
   - Visit your Netlify URL
   - Test the chat interface
   - Verify API routes work

2. **Set Custom Domain** (Optional)
   - Go to Site settings → Domain management
   - Add your custom domain
   - Configure DNS as instructed

3. **Enable Analytics** (Optional)
   - Go to Site settings → Analytics
   - Enable Netlify Analytics

## Continuous Deployment

Once connected to Git:
- Every push to `main` branch triggers a production deploy
- Pull requests get preview deployments automatically
- You can configure branch-specific settings in Netlify Dashboard

## Support

For issues:
- Check Netlify build logs in the dashboard
- Review Next.js build output
- Check environment variables are set correctly
- Verify Node.js version compatibility

