import type { NextConfig } from "next";
const backend = (process.env.BACKEND_URL || "http://localhost:5080").replace(/\/+$/, "");
if (process.env.VERCEL && !process.env.BACKEND_URL) {
  throw new Error("Set BACKEND_URL to the public HTTPS address of the league backend before deploying to Vercel.");
}
const config: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/hubs/:path*", destination: `${backend}/hubs/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/optimized-images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
