# FuelSense 360 Frontend

Next.js application for the FuelSense 360 Maritime Bunker Port Optimization system.

## Project Structure

```
frontend/
├── app/                         # Next.js App Router
│   ├── api/                     # API routes
│   │   ├── chat/                # Basic chat endpoint
│   │   ├── chat-langgraph/      # LangGraph-based chat
│   │   ├── chat-multi-agent/    # Multi-agent orchestration
│   │   ├── monitoring/          # Performance monitoring
│   │   └── test-*/              # Test endpoints
│   ├── chat-multi-agent/        # Multi-agent chat page
│   ├── analytics/               # Analytics dashboard
│   └── compare/                 # Implementation comparison
├── components/                  # React components
│   ├── cards/                   # Response card components
│   ├── template-response/       # Template rendering
│   ├── ui/                      # Shadcn UI components
│   └── *.tsx                    # Feature components
├── lib/                         # Core libraries
│   ├── config/                  # Configuration loaders
│   ├── data/                    # Static data (ports, prices, vessels)
│   ├── engines/                 # Business logic engines
│   ├── formatters/              # Response formatters
│   ├── multi-agent/             # Multi-agent orchestration
│   ├── registry/                # Agent/tool registries
│   ├── tools/                   # Agent tools
│   ├── utils/                   # Utilities
│   └── validators/              # Input validation
├── config/                      # YAML configurations
│   ├── agents/                  # Agent configs
│   └── workflows/               # Workflow definitions
└── tests/                       # Test suites
```

## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm or yarn

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env.local` file with:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key          # Optional - for cost savings
LANGCHAIN_API_KEY=your_langsmith_api_key    # Optional - for monitoring
LANGCHAIN_TRACING_V2=true                    # Optional
LANGCHAIN_PROJECT=fuelsense-360              # Optional

# Repository Pattern - Required for data access
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Synthesis - Optional
LLM_FIRST_SYNTHESIS=false   # When true, Finalize uses LLM-first synthesis; template fallback on failure
```

**Note:** If Redis or Supabase credentials are not provided, the system will:
- Use a mock cache (no caching) if Redis is unavailable
- Fall back to JSON files for data access if database is unavailable
- Still function but with reduced performance and no persistence

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Available Pages

| Route | Description |
|-------|-------------|
| `/` | Home page |
| `/chat-multi-agent` | Main multi-agent chat interface |
| `/chat-langgraph` | LangGraph-based chat |
| `/analytics` | Performance analytics dashboard |
| `/compare` | Implementation comparison view |

## Repository Pattern & Service Container

The application uses a repository pattern with dependency injection via `ServiceContainer`.

### Usage

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

// Get singleton instance
const container = ServiceContainer.getInstance();

// Access repositories
const portRepo = container.getPortRepository();
const priceRepo = container.getPriceRepository();
const vesselRepo = container.getVesselRepository();

// Use repositories
const ports = await portRepo.findBunkerPorts();
const prices = await priceRepo.getLatestPrices({
  portCode: 'SGSIN',
  fuelTypes: ['VLSFO', 'MGO']
});
const vessel = await vesselRepo.findByName('MV Pacific Star');
```

### Features

- **3-Tier Fallback**: Cache → Database → JSON files
- **Graceful Degradation**: Works without Redis or database (uses JSON fallback)
- **Singleton Pattern**: Single instance shared across application
- **Type-Safe**: Full TypeScript support

### Repositories

- **PortRepository**: Port data access (`findByCode`, `findBunkerPorts`, `findNearby`, `searchByName`)
- **PriceRepository**: Fuel price data (`getLatestPrices`, `getPriceHistory`, `getAveragePrices`, `addPrice`)
- **VesselRepository**: Vessel profiles (`findByName`, `findByIMO`, `getConsumptionAtSpeed`, `validateCapacity`)

## Testing

```bash
# Run all tests
npm run test:all

# Type checking
npm run type-check

# Individual test suites
npm run test:synthesis          # Synthesis engine tests
npm run test:template-formatter # Template formatter tests
npm run test:components         # Component tests
npm run test:baseline           # Baseline integration tests
```

## Building

```bash
npm run build
npm start
```

## Query Routing (AI-FIRST)

The multi-agent system uses **AI-FIRST** routing in `lib/multi-agent/pattern-matcher.ts`:

1. **Tier 1a**: LLM Intent Classification (GPT-4o-mini) — primary, handles natural language
2. **Tier 1b**: Regex patterns — fallback when LLM fails or low confidence
3. **Tier 2**: Decision framework — confidence thresholds
4. **Tier 3**: LLM reasoning — complex/ambiguous queries

IntentClassifier results are cached (Redis, 7-day TTL); cache hits are &lt;10ms.

## Key Technologies

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **LangGraph** - Multi-agent orchestration
- **LangChain** - LLM integration
- **Anthropic Claude** - Primary LLM
- **Leaflet/React-Leaflet** - Map visualization
- **Recharts** - Data visualization
- **Tailwind CSS** - Styling
- **Shadcn UI** - Component library
- **Zod** - Schema validation

## Deployment

Deploy to Netlify: base directory `frontend`, build `npm run build`, publish `frontend/.next`. Set env vars (ANTHROPIC_API_KEY, Redis, etc.) in Netlify dashboard.

## Architecture

See [ARCHITECTURE.md](../ARCHITECTURE.md) in project root.
