# Environment Configuration

## WorldPortIndex API Configuration

The WorldPortIndex API integration can be configured via environment variables for different environments (development, staging, production).

### Environment Variables

#### Required Variables

```env
# Redis Cache (Required for port data caching)
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
```

#### Optional API Configuration

```env
# WorldPortIndex API Base URL
# Default: https://uat.fuelsense-api.dexpertsystems.com
NEXT_PUBLIC_WORLD_PORT_API_URL=https://uat.fuelsense-api.dexpertsystems.com

# API Authentication (if required in production)
# Currently not needed for UAT environment
NEXT_PUBLIC_WORLD_PORT_API_KEY=your_api_key_here

# Feature Flag
# Enable/disable WorldPortIndex API integration
USE_PORT_API=true
```

### Environment-Specific Configuration

#### Development (.env.local)
```env
NEXT_PUBLIC_WORLD_PORT_API_URL=https://uat.fuelsense-api.dexpertsystems.com
USE_PORT_API=true
```

#### Staging (.env.staging)
```env
NEXT_PUBLIC_WORLD_PORT_API_URL=https://staging.fuelsense-api.dexpertsystems.com
USE_PORT_API=true
```

#### Production (.env.production)
```env
NEXT_PUBLIC_WORLD_PORT_API_URL=https://api.fuelsense-api.dexpertsystems.com
NEXT_PUBLIC_WORLD_PORT_API_KEY=prod_api_key_here
USE_PORT_API=true
```

### How It Works

The `WorldPortIndexClient` reads the base URL from the environment:

```typescript
constructor() {
  this.baseURL = 
    process.env.NEXT_PUBLIC_WORLD_PORT_API_URL || 
    'https://uat.fuelsense-api.dexpertsystems.com';  // fallback to UAT
  this.timeout = 10000;
}
```

**Fallback Behavior:**
- If `NEXT_PUBLIC_WORLD_PORT_API_URL` is not set, defaults to UAT endpoint
- Ensures the application works even without explicit configuration

### Testing Different Environments

#### Test with UAT (Default)
```bash
npm run test:port-api
```

#### Test with Custom Endpoint
```bash
NEXT_PUBLIC_WORLD_PORT_API_URL=https://custom-api.example.com npm run test:port-api
```

### Configuration Files

1. **`.env.example`** - Template with all variables and descriptions
2. **`.env.local`** - Local development (not committed to git)
3. **`.env.staging`** - Staging environment variables
4. **`.env.production`** - Production environment variables

### Security Notes

⚠️ **Important:**
- Never commit `.env.local`, `.env.staging`, or `.env.production` to git
- Use `NEXT_PUBLIC_` prefix only for variables that are safe to expose to the browser
- Store sensitive API keys in secure secret management (e.g., Vercel Environment Variables)
- Rotate API keys regularly if authentication is enabled

### Verifying Configuration

Check which API URL is being used:

```bash
# In Node.js/test scripts
console.log('API URL:', process.env.NEXT_PUBLIC_WORLD_PORT_API_URL);

# In browser (Next.js client)
console.log('API URL:', process.env.NEXT_PUBLIC_WORLD_PORT_API_URL);
```

### Troubleshooting

**Issue:** API calls fail with network error
- **Solution:** Verify `NEXT_PUBLIC_WORLD_PORT_API_URL` is set correctly
- **Solution:** Check if the API endpoint is accessible from your network

**Issue:** Using wrong environment
- **Solution:** Ensure correct `.env.*` file is loaded
- **Solution:** Restart Next.js dev server after changing env files

**Issue:** Variables not updating
- **Solution:** Restart the development server (`npm run dev`)
- **Solution:** For `NEXT_PUBLIC_*` vars, rebuild the application

### Best Practices

1. **Use environment-specific files** for different deployments
2. **Set fallback values** for critical configuration
3. **Document all variables** in `.env.example`
4. **Validate required variables** on application startup
5. **Use typed environment** with TypeScript for safety

### Example Validation (Optional)

Add to `lib/clients/world-port-index-client.ts`:

```typescript
constructor() {
  const apiUrl = process.env.NEXT_PUBLIC_WORLD_PORT_API_URL;
  
  if (!apiUrl) {
    console.warn(
      '[WorldPortIndexClient] NEXT_PUBLIC_WORLD_PORT_API_URL not set, using default UAT endpoint'
    );
  }
  
  this.baseURL = apiUrl || 'https://uat.fuelsense-api.dexpertsystems.com';
  this.timeout = 10000;
}
```

## Summary

- ✅ API URL is configurable via environment variables
- ✅ Falls back to UAT endpoint if not configured
- ✅ Supports different environments (dev, staging, prod)
- ✅ Can be overridden per deployment or test run
- ✅ Follows Next.js environment variable conventions
