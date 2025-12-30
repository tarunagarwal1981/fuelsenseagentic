# Netlify Branch Deploy Setup Guide

This guide explains how to set up separate deployments for `main` (production) and `dev` (development) branches with different domains/subdomains, while sharing the same environment variables.

## Overview

- **Production (main branch)**: Your main domain (e.g., `fuelsense360.com`)
- **Development (dev branch)**: Subdomain (e.g., `dev.fuelsense360.com`)
- **Shared Environment Variables**: Both branches use the same Netlify project, so env vars are shared automatically

## Step-by-Step Setup

### 1. Enable Branch Deploys in Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Navigate to **Site settings** → **Build & deploy** → **Continuous Deployment**
4. Under **Branch deploys**:
   - **Uncheck** "Deploy only the production branch" (if checked)
   - Set **Production branch**: `main`
   - Set **Branch deploys**: Select "All branches" or "Let me add individual branches" and add `dev`

### 2. Configure Custom Domains

#### For Production (main branch):
1. Go to **Site settings** → **Domain management**
2. Click **Add custom domain**
3. Enter your production domain (e.g., `fuelsense360.com`)
4. Follow DNS setup instructions
5. This domain will automatically be assigned to the `main` branch

#### For Development (dev branch):
1. In **Domain management**, click **Add custom domain** again
2. Enter your dev subdomain (e.g., `dev.fuelsense360.com`)
3. Follow DNS setup instructions
4. After adding, click on the domain
5. Under **Branch subdomain**, select `dev` branch
6. This ensures the dev subdomain only serves the dev branch

### 3. Configure Environment Variables (Shared)

Since both branches use the same Netlify project, environment variables are shared:

1. Go to **Site settings** → **Environment variables**
2. Add your variables (they apply to all branches):
   - `ANTHROPIC_API_KEY` (Required)
   - `OPENAI_API_KEY` (Optional, recommended)
   - `LANGCHAIN_API_KEY` (Optional)
   - `LANGCHAIN_TRACING_V2` (Optional)
   - `LANGCHAIN_PROJECT` (Optional)

**Note**: If you need different env vars per branch, you can use:
- **Context-specific variables**: Set variables for specific contexts (production, branch-deploy, etc.)
- But for simplicity, shared variables work for most use cases

### 4. Verify Branch Deploys

1. Push to `main` branch → Deploys to production domain
2. Push to `dev` branch → Deploys to dev subdomain
3. Check **Deploys** tab to see which branch each deploy is from

## Branch Deploy URLs

After setup, you'll have:

- **Production**: `https://fuelsense360.com` (or your custom domain)
- **Development**: `https://dev.fuelsense360.com` (or your dev subdomain)
- **Netlify Preview URLs**: Still available for each deploy (e.g., `https://random-name-123.netlify.app`)

## Testing the Setup

1. **Test Production**:
   ```bash
   git checkout main
   git push origin main
   ```
   - Should deploy to production domain
   - Check Netlify dashboard → Deploys → Should show "Production deploy"

2. **Test Development**:
   ```bash
   git checkout dev
   git push origin dev
   ```
   - Should deploy to dev subdomain
   - Check Netlify dashboard → Deploys → Should show "Branch deploy: dev"

## Troubleshooting

### Issue: Dev branch not deploying
- **Solution**: Check Branch deploys settings → Make sure `dev` is in the allowed branches list

### Issue: Wrong domain serving wrong branch
- **Solution**: In Domain management → Click domain → Set correct branch assignment

### Issue: Environment variables not working on dev branch
- **Solution**: Environment variables are shared by default. If you need different values, use context-specific variables:
  - Go to Environment variables
  - Click "Add variable"
  - Set scope to "Branch deploys" or "Production" as needed

### Issue: Build fails on dev branch
- **Solution**: Check build logs. Both branches use the same build command, so if main works, dev should too.

## Advanced: Context-Specific Configuration

If you need different build commands or settings per branch, you can use contexts in `netlify.toml`:

```toml
[context.production]
  command = "cd frontend && npm install && npm run build"

[context.branch-deploy]
  command = "cd frontend && npm install && npm run build"
```

For now, both branches use the same configuration, which is recommended for consistency.

## Benefits of This Setup

✅ **Single Project**: One Netlify project, easier to manage  
✅ **Shared Env Vars**: Set once, works for both branches  
✅ **Separate Domains**: Clear separation between dev and production  
✅ **Easy Testing**: Test features on dev before merging to main  
✅ **Cost Effective**: No duplicate projects or configurations  

## Next Steps

1. Complete the setup steps above
2. Test by pushing to both branches
3. Verify domains are working correctly
4. Start developing on `dev` branch and deploying to dev subdomain!

