import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Netlify OpenNext adapter handles output — do not set output: 'export'
  reactStrictMode: true,
  poweredByHeader: false,
  // Avoid picking parent folder lockfile as workspace root
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
