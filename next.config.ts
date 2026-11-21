import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 첫 화면은 선물상자로
  async redirects() {
    return [{ source: "/", destination: "/gift", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
