/**
 * Bump patch version: 2.0.2 → 2.0.3
 * Updates package.json + src/lib/version.ts
 * Usage: node scripts/bump-version.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const verPath = path.join(root, "src", "lib", "version.ts");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const parts = String(pkg.version || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
const next = `${parts[0]}.${parts[1]}.${parts[2]}`;
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const ts = `/**
 * SoloPulse app version (semver).
 * On every product update/deploy, bump the **patch** digit:
 *   2.0.1 → 2.0.2 → 2.0.3 …
 * Run: npm run version:bump  (auto before railway deploy)
 */
export const APP_VERSION = "${next}";

/** UI label e.g. V${next} */
export const APP_VERSION_LABEL = \`V\${APP_VERSION}\`;
`;
fs.writeFileSync(verPath, ts);
console.log(`version → ${next} (V${next})`);
