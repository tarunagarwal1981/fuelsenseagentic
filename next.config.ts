import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => [
    { source: "/chat", destination: "/", permanent: true },
    { source: "/chat-langgraph", destination: "/", permanent: true },
    { source: "/chat-multi-agent", destination: "/", permanent: true },
  ],
};

export default nextConfig;
