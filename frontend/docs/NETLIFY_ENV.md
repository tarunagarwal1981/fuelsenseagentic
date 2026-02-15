# Netlify environment variables

Set these in **Site settings → Environment variables** (or in Netlify UI: Build & deploy → Environment). Use the same values as in `.env.local` for UAT, or your production API URLs and keys.

## Required for chat and APIs

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for chat/supervisor | `sk-ant-...` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (LangGraph + cache) | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | (from Upstash dashboard) |

## Optional but recommended (APIs)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI key (intent/planning fallback) | `sk-proj-...` |
| `NEXT_PUBLIC_FUELSENSE_API_URL` | FuelSense API base (bunker, etc.) | `https://uat.fuelsense-api.dexpertsystems.com` |
| `NEXT_PUBLIC_WORLD_PORT_API_URL` | World port index API base | same as above |
| `NOON_REPORT_API_URL` | Datalogs/noon reports base | same as above |
| `VESSEL_MASTER_API_URL` | Vessel details API base | same as above |
| `BASELINE_PROFILE_API_URL` | Baseline / vessel-performance-model base | same as above |
| `HULL_PERFORMANCE_API_URL` | Hull performance API base | same as above |
| `HULL_PERFORMANCE_API_KEY` | Hull API auth (if required) | (optional) |

## Hull performance data source

| Variable | Description | Values |
|----------|-------------|--------|
| `HULL_PERFORMANCE_SOURCE` | Where to read hull data | `api` (default) or `db` |
| `HULL_PERFORMANCE_CACHE_TTL` | Cache TTL in seconds | e.g. `43200` (12h) |

If `HULL_PERFORMANCE_SOURCE=db`, also set:

- `HULL_PERFORMANCE_DB_HOST`
- `HULL_PERFORMANCE_DB_PORT` (default `3306`)
- `HULL_PERFORMANCE_DB_DATABASE` (e.g. `fuelsense`)
- `HULL_PERFORMANCE_DB_USER`
- `HULL_PERFORMANCE_DB_PASSWORD`
- `HULL_PERFORMANCE_DB_TABLE` (e.g. `NewTable`)

**Note:** Baseline curves in the speed–consumption chart are only available when using the API (`HULL_PERFORMANCE_SOURCE=api`). With `db`, baseline is not fetched.

## Supervisor / feature flags

| Variable | Description | Default |
|----------|-------------|---------|
| `MULTI_AGENT_ENABLED` | Enable multi-agent chat | `true` (set to `false` to disable) |
| `USE_AGENTIC_SUPERVISOR` | Use LLM-based supervisor | `true` |
| `USE_DYNAMIC_SUPERVISOR_PROMPT` | Dynamic prompts from registry | `true` |
| `USE_PORT_API` | Enable WorldPortIndex API | `true` |

## Logging (Axiom)

| Variable | Description |
|----------|-------------|
| `AXIOM_TOKEN` | Axiom API token |
| `AXIOM_ORG_ID` | Axiom org ID |
| `AXIOM_DATASET` | Dataset name (e.g. `fuelsense`) |

## Supabase (if used)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

## Client-only (NEXT_PUBLIC_*)

These are inlined at build time and must be set in Netlify for the deployed app:

- `NEXT_PUBLIC_FUELSENSE_API_URL`
- `NEXT_PUBLIC_WORLD_PORT_API_URL`
- `NEXT_PUBLIC_BASE_URL` (optional; used by some flows, e.g. `https://your-site.netlify.app`)
- `NEXT_PUBLIC_DEBUG_PORT_ID` (optional; set to `true` for debug logging)

## Chart configuration (YAML, not env)

Speed–consumption chart minimums (e.g. plot only points with speed > 5 and consumption > 5) are set in **`config/charts.yaml`** in the repo, not via env vars. See `frontend/config/charts.yaml` for `speed_consumption.min_speed` and `speed_consumption.min_consumption`.
