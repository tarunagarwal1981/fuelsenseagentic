# FuelSense 360 - Maritime Bunker Port Optimization Agent

An AI-powered agent designed to optimize maritime bunker port operations using advanced decision-making capabilities.

## Overview

FuelSense 360 is a TypeScript-based AI agent that leverages Anthropic's Claude API to provide intelligent optimization solutions for maritime bunker port operations. The agent can analyze port conditions, vessel requirements, and operational constraints to recommend optimal fueling strategies.

## Project Structure

```
fuelsense-360/
├── src/
│   ├── agents/          # AI agent implementations
│   ├── tools/           # Agent tools and utilities
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Helper functions
├── tests/               # Test files
├── .env.example         # Environment variables template
├── .gitignore          # Git ignore rules
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Anthropic API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

4. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

## Development

Run in development mode:
```bash
npm run dev
```

Build the project:
```bash
npm run build
```

Run the built project:
```bash
npm start
```

## Configuration

The project uses TypeScript with strict mode enabled. All source files are in the `src/` directory and will be compiled to `dist/`.

## License

ISC


