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
```

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

This application is deployed to Netlify. See the root-level deployment documentation:

- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment guide
- [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md) - Deployment checklist
- [NETLIFY_ENV_SETUP.md](../NETLIFY_ENV_SETUP.md) - Environment variables
- [NETLIFY_BRANCH_DEPLOY_SETUP.md](../NETLIFY_BRANCH_DEPLOY_SETUP.md) - Branch deploys

## Architecture

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed architecture documentation.
