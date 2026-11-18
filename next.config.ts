import type { NextConfig } from "next";

/**
 * Static security headers for every response. The nonce-based Content-Security-Policy
 * is added per request in `src/proxy.ts` because it needs a fresh nonce each time.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
