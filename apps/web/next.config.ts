import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/trpc/:path*",
        destination: "http://voyager-api:4000/trpc/:path*",
      },
    ];
  },
};

export default nextConfig;
