import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// One id per build: versions the service worker's caches, and lets an open tab notice
// it's running an older build than the server.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.REPTR_BUILD_ID ??
  `local-${Date.now()}`;

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // Let the dev server work when opened as 127.0.0.1 or from a phone on the same network.
  // Without this, Next blocks its dev scripts and no button on the page responds.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  partialPrefetching: true,
  poweredByHeader: false,
  // Sign-in is gone: old sign-in pages and email links go to the app, which sends anyone
  // without a profile to create one.
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: false },
      { source: "/auth/:path*", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
