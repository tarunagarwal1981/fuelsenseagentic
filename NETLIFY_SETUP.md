# Netlify Deployment Setup - Troubleshooting

## Issue: "Base directory does not exist: /opt/build/repo/frontend"

This error occurs when the `frontend` folder is not present in your git repository.

## Solution 1: Ensure Frontend Folder is Committed (Recommended)

### Step 1: Check if frontend is in your repository

```bash
# Check git status
git status

# Check if frontend folder is tracked
git ls-files | grep frontend
```

### Step 2: Add and commit the frontend folder

If the frontend folder is not tracked:

```bash
# Add the frontend folder
git add frontend/

# Commit it
git commit -m "Add frontend folder for Netlify deployment"

# Push to your repository
git push origin main
```

### Step 3: Verify in GitHub

1. Go to your GitHub repository
2. Check that the `frontend` folder exists in the root
3. Verify it contains:
   - `package.json`
   - `app/` directory
   - `components/` directory
   - `next.config.ts`

## Solution 2: Alternative Configuration (If Frontend is Root)

If your repository root IS the frontend (i.e., you only want to deploy the frontend), use this `netlify.toml`:

```toml
[build]
  command = "npm install && npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[build.environment]
  NODE_VERSION = "18"
  NEXT_TELEMETRY_DISABLED = "1"
```

## Solution 3: Deploy from Frontend Subdirectory via Netlify Dashboard

If you can't change the repository structure:

1. Go to Netlify Dashboard → Site settings → Build & deploy
2. Under "Build settings", manually set:
   - **Base directory**: `frontend`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `.next`
3. Save and redeploy

## Quick Check Commands

```bash
# Check repository structure
ls -la

# Check if frontend exists
ls -la frontend/

# Check git status
git status frontend/

# See what's committed
git ls-tree -r HEAD --name-only | grep frontend
```

## Common Issues

### Issue: Frontend folder exists locally but not in repo
**Solution**: The folder might be in `.gitignore` or not committed. Check `.gitignore` and commit the folder.

### Issue: Frontend folder has different name
**Solution**: Update `base = "frontend"` in `netlify.toml` to match your actual folder name.

### Issue: Build works locally but fails on Netlify
**Solution**: 
- Ensure all dependencies are in `frontend/package.json`
- Check that `node_modules` is in `.gitignore` (it should be)
- Verify Node.js version matches (18 or higher)

## Verification

After fixing, trigger a new deploy:
1. Make a small change (like updating a comment)
2. Commit and push
3. Netlify will automatically redeploy
4. Check build logs to verify the frontend folder is found

