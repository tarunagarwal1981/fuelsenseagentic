import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
