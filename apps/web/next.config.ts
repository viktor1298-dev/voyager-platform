import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  compress: true,
  images: {
    unoptimized: true,
  },
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
