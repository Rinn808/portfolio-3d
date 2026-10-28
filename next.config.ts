import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Chỉ import phần three.js thực sự dùng → bundle nhỏ hơn
  experimental: { optimizePackageImports: ["three"] },
};

export default nextConfig;
