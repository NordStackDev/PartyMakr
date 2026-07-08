import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Actions are CSRF-protected: the request's `origin` must match the
  // server's `host`, or Next throws "Invalid Server Actions request". When the
  // dev server is reached through a forwarded/tunnelled URL (e.g. testing on a
  // phone via VS Code port forwarding), the two differ — allow those origins
  // in development only, so production keeps full protection.
  ...(process.env.NODE_ENV === "development"
    ? {
        experimental: {
          serverActions: {
            allowedOrigins: [
              "localhost:3000",
              "127.0.0.1:3000",
              "*.devtunnels.ms",
            ],
          },
        },
      }
    : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
