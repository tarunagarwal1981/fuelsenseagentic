import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// Load .env from cwd and parent so API routes get HULL_PERFORMANCE_* (same as test script)
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "..", ".env") });

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    HULL_PERFORMANCE_SOURCE: process.env.HULL_PERFORMANCE_SOURCE || 'api',
    HULL_PERFORMANCE_API_URL: process.env.HULL_PERFORMANCE_API_URL,
    HULL_PERFORMANCE_DB_HOST: process.env.HULL_PERFORMANCE_DB_HOST,
    HULL_PERFORMANCE_DB_PORT: process.env.HULL_PERFORMANCE_DB_PORT,
    HULL_PERFORMANCE_DB_DATABASE: process.env.HULL_PERFORMANCE_DB_DATABASE,
    HULL_PERFORMANCE_DB_USER: process.env.HULL_PERFORMANCE_DB_USER,
    HULL_PERFORMANCE_DB_PASSWORD: process.env.HULL_PERFORMANCE_DB_PASSWORD,
    HULL_PERFORMANCE_DB_TABLE: process.env.HULL_PERFORMANCE_DB_TABLE,
  },
  redirects: async () => [
    { source: "/chat", destination: "/", permanent: true },
    { source: "/chat-langgraph", destination: "/", permanent: true },
    { source: "/chat-multi-agent", destination: "/", permanent: true },
  ],
  // Exclude repository files from Edge Runtime bundling
  // These files use Node.js modules (fs, path) and should only run in Node.js runtime
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js-only modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        'fs/promises': false,
      };
    }
    return config;
  },
  // Configure server components to use Node.js runtime
  serverExternalPackages: ['@supabase/supabase-js', '@upstash/redis'],
  // Add empty turbopack config to silence the warning
  turbopack: {},
};

export default nextConfig;
