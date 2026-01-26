# FuelSense 360 Setup Guide

This guide covers environment setup, infrastructure configuration, and local development setup for the FuelSense 360 application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Upstash Redis Setup](#upstash-redis-setup)
4. [Supabase Setup](#supabase-setup)
5. [Local Development](#local-development)
6. [Verification](#verification)

## Prerequisites

- **Node.js**: v18 or higher
- **npm** or **yarn**: Package manager
- **Git**: Version control
- **Upstash Account**: For Redis caching (free tier available)
- **Supabase Account**: For database (free tier available)

## Environment Variables

Create a `.env.local` file in the `frontend/` directory with the following variables:

### Required Variables

```bash
# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic API (for LLM)
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Optional Variables

```bash
# External API Keys (if using premium services)
SEA_ROUTE_API_KEY=your-sea-route-api-key
OPEN_METEO_API_KEY=your-open-meteo-api-key

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Environment Variable Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis authentication token | `xxx` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | `eyJxxx` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key | `eyJxxx` |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key | `sk-ant-xxx` |
| `SEA_ROUTE_API_KEY` | No | SeaRoute API key (if using premium) | `xxx` |
| `OPEN_METEO_API_KEY` | No | Open-Meteo API key (if using premium) | `xxx` |

## Upstash Redis Setup

### Step 1: Create Upstash Account

1. Go to [https://upstash.com](https://upstash.com)
2. Sign up for a free account
3. Verify your email

### Step 2: Create Redis Database

1. Log in to Upstash Console
2. Click **"Create Database"**
3. Choose **"Global"** or **"Regional"** (Global recommended for better latency)
4. Select **"Redis"** as database type
5. Choose a name (e.g., `fuelsense-cache`)
6. Click **"Create"**

### Step 3: Get Connection Details

1. After creation, click on your database
2. Navigate to **"REST API"** tab
3. Copy the following:
   - **UPSTASH_REDIS_REST_URL**: Found under "REST Endpoint"
   - **UPSTASH_REDIS_REST_TOKEN**: Found under "REST Token"

### Step 4: Configure Environment Variables

Add the credentials to your `.env.local`:

```bash
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

### Step 5: Verify Connection

Test the connection:

```bash
cd frontend
npm run test:integration:services
```

You should see cache hit/miss logs indicating Redis is working.

### Upstash Redis Features Used

- **REST API**: Used for serverless compatibility
- **TTL Support**: Automatic expiration of cached data
- **Pattern Matching**: For cache invalidation (`fuelsense:*`)

### Free Tier Limits

- **10,000 commands/day**: Sufficient for development
- **256 MB storage**: Adequate for caching
- **Global replication**: Available on free tier

## Supabase Setup

### Step 1: Create Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for a free account
3. Verify your email

### Step 2: Create New Project

1. Click **"New Project"**
2. Fill in project details:
   - **Name**: `fuelsense-360` (or your choice)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
3. Click **"Create new project"**
4. Wait for project initialization (~2 minutes)

### Step 3: Get API Keys

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key**: `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

### Step 4: Create Database Tables

Run the following SQL in Supabase SQL Editor:

```sql
-- Ports table
CREATE TABLE IF NOT EXISTS ports (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  coordinates JSONB NOT NULL, -- [lat, lon]
  bunker_capable BOOLEAN DEFAULT false,
  fuels_available TEXT[] DEFAULT '{}',
  timezone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fuel prices table
CREATE TABLE IF NOT EXISTS fuel_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  port_code TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  price_usd NUMERIC(10, 2) NOT NULL,
  date DATE NOT NULL,
  source TEXT DEFAULT 'manual',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(port_code, fuel_type, date)
);

-- Vessels table
CREATE TABLE IF NOT EXISTS vessels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  imo TEXT,
  vessel_type TEXT NOT NULL,
  dwt INTEGER,
  built_year INTEGER,
  current_rob JSONB, -- {VLSFO: number, LSMGO: number, ...}
  tank_capacity JSONB, -- {VLSFO: number, LSMGO: number, total: number}
  consumption_profile JSONB NOT NULL, -- Speed-consumption curves
  operational_speed_knots NUMERIC(5, 2),
  hull_condition JSONB,
  owner TEXT,
  operator TEXT,
  flag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ports_code ON ports(code);
CREATE INDEX IF NOT EXISTS idx_ports_bunker_capable ON ports(bunker_capable);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_port_code ON fuel_prices(port_code);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_date ON fuel_prices(date DESC);
CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name);
CREATE INDEX IF NOT EXISTS idx_vessels_imo ON vessels(imo);
```

### Step 5: Enable Row Level Security (Optional)

For production, enable RLS:

```sql
-- Enable RLS
ALTER TABLE ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your needs)
CREATE POLICY "Allow read access" ON ports FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON fuel_prices FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON vessels FOR SELECT USING (true);
```

### Step 6: Import Initial Data (Optional)

You can import data from JSON files:

1. Go to **Table Editor** → Select table
2. Click **"Insert"** → **"Import data from CSV"**
3. Or use the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Import data (if you have CSV files)
supabase db import ports.csv
```

### Step 7: Configure Environment Variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

## Local Development

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/fuelsense.git
cd fuelsense
```

### Step 2: Install Dependencies

```bash
cd frontend
npm install
```

### Step 3: Configure Environment

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in all required environment variables (see [Environment Variables](#environment-variables))

### Step 4: Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Step 5: Run Tests

```bash
# Run all tests
npm test

# Run integration tests
npm run test:integration:services

# Run performance benchmarks
npm run test:performance
```

### Development Workflow

1. **Start Redis**: Upstash Redis is cloud-hosted, no local setup needed
2. **Start Supabase**: Use cloud instance, or run locally with Docker:
   ```bash
   docker run -d \
     --name supabase \
     -p 54321:54321 \
     supabase/supabase:latest
   ```
3. **Start Next.js**: `npm run dev`
4. **Watch logs**: Check console for cache hits/misses and service initialization

### Hot Reload

- Next.js automatically reloads on file changes
- Service Container reinitializes on server restart
- Cache persists across reloads (Upstash Redis)

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

Check logs for:
- `[SERVICE-CONTAINER]`: Service initialization
- `[CACHE HIT]`: Cache operations
- `[DB HIT]`: Database operations
- `[FALLBACK HIT]`: JSON fallback usage

## Verification

### Test Service Container

Create a test file `test-setup.ts`:

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

async function testSetup() {
  const container = ServiceContainer.getInstance();
  
  console.log('Cache enabled:', container.isCacheEnabled());
  
  // Test repositories
  const portRepo = container.getPortRepository();
  const port = await portRepo.findByCode('SGSIN');
  console.log('Port found:', port?.name);
  
  // Test services
  const routeService = container.getRouteService();
  console.log('RouteService initialized');
  
  console.log('✅ Setup verified!');
}

testSetup();
```

Run: `npx tsx test-setup.ts`

### Test Cache

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

async function testCache() {
  const container = ServiceContainer.getInstance();
  const cache = container.getCache();
  
  // Test write
  await cache.set('test:key', { test: 'value' }, 60);
  console.log('✅ Cache write successful');
  
  // Test read
  const value = await cache.get('test:key');
  console.log('✅ Cache read successful:', value);
}

testCache();
```

### Test Database

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

async function testDatabase() {
  const container = ServiceContainer.getInstance();
  const db = container.getDatabase();
  
  const { data, error } = await db.from('ports').select('*').limit(1);
  
  if (error) {
    console.error('❌ Database error:', error);
  } else {
    console.log('✅ Database connection successful:', data?.length, 'rows');
  }
}

testDatabase();
```

## Troubleshooting

### Redis Connection Issues

**Error**: `Failed to initialize Redis cache`

**Solutions**:
1. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are correct
2. Check Upstash dashboard for database status
3. Verify network connectivity
4. Check free tier limits (10,000 commands/day)

### Supabase Connection Issues

**Error**: `Failed to initialize Supabase client`

**Solutions**:
1. Verify all three Supabase environment variables are set
2. Check Supabase project is active (not paused)
3. Verify API keys are correct (anon vs service_role)
4. Check network connectivity

### Cache Not Working

**Symptoms**: Always seeing `[DB HIT]` instead of `[CACHE HIT]`

**Solutions**:
1. Check `container.isCacheEnabled()` returns `true`
2. Verify Redis credentials
3. Check cache TTL settings
4. Verify cache key format matches pattern

### Database Fallback Issues

**Symptoms**: Data not loading from JSON fallback

**Solutions**:
1. Verify JSON files exist in `frontend/lib/data/`
2. Check file permissions
3. Verify JSON format matches expected structure
4. Check fallback path in repository constructor

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Read [API_REFERENCE.md](./API_REFERENCE.md) for API documentation
- Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration from old system

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section
- Review logs with `LOG_LEVEL=debug`
- Check GitHub Issues
- Contact development team
