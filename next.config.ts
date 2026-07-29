import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Cloudflare OpenNext (@opennextjs/cloudflare) — not static export
  reactStrictMode: true,
  poweredByHeader: false,
  // Avoid picking parent folder lockfile as workspace root
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

// Local OpenNext Cloudflare runtime (dev only — ignore if package missing)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  if (typeof initOpenNextCloudflareForDev === "function") {
    initOpenNextCloudflareForDev();
  }
} catch {
  /* not using OpenNext locally */
}
