/**
 * Safe Cloudflare OpenNext build (no recursive loop).
 *
 * OpenNext re-invokes `npm run build` for the Next compile step.
 * If that script is also `opennextjs-cloudflare build`, CI loops forever.
 *
 * Lock-file protocol:
 *  1) Outer: create .solopulse-next-only → run opennextjs-cloudflare build
 *  2) Inner (OpenNext → npm run build): lock exists → run `next build` only
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const lock = path.join(process.cwd(), ".solopulse-next-only");

if (fs.existsSync(lock) || process.env.SOLOPULSE_NEXT_ONLY === "1") {
  console.log("[cf-build] inner: next build only");
  execSync("npx next build", { stdio: "inherit", env: process.env });
  process.exit(0);
}

console.log("[cf-build] outer: OpenNext Cloudflare build");
fs.writeFileSync(lock, String(Date.now()), "utf8");
try {
  execSync("npx opennextjs-cloudflare build", {
    stdio: "inherit",
    env: { ...process.env, SOLOPULSE_NEXT_ONLY: "1" },
  });
} finally {
  try {
    fs.unlinkSync(lock);
  } catch {
    /* */
  }
}
