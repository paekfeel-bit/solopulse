/**
 * Safe Cloudflare / OpenNext build entry.
 * OpenNext invokes `npm run build` for the Next step — if that script is
 * `opennextjs-cloudflare build`, it recurses forever. This guard breaks the loop:
 *
 *  - CF Workers Builds: npm run build  → this file → opennext (sets SOLOPULSE_NEXT_ONLY)
 *  - OpenNext re-calls npm run build   → this file → next build only
 */
import { execSync } from "node:child_process";

const env = { ...process.env };

if (env.SOLOPULSE_NEXT_ONLY === "1") {
  console.log("[cf-build] Next.js compile only (OpenNext inner step)");
  execSync("npx next build", { stdio: "inherit", env });
  process.exit(0);
}

console.log("[cf-build] OpenNext Cloudflare full build");
execSync("npx opennextjs-cloudflare build", {
  stdio: "inherit",
  env: { ...env, SOLOPULSE_NEXT_ONLY: "1" },
});
