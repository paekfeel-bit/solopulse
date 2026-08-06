import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const account = "60fff325c136cbad7a3b5a8ba3434df6";
const scriptPath = path.join(process.cwd(), "worker", "index.js");
const script = fs.readFileSync(scriptPath, "utf8");

const cfgCandidates = [
  path.join(process.env.APPDATA || "", "xdg.config", ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), ".wrangler", "config", "default.toml"),
];
let token = process.env.CLOUDFLARE_API_TOKEN || "";
for (const p of cfgCandidates) {
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (m) {
    token = m[1];
    break;
  }
}
if (!token) {
  console.error("No CF token");
  process.exit(1);
}

const meta = {
  main_module: "index.js",
  compatibility_date: "2025-03-01",
  bindings: [
    {
      type: "plain_text",
      name: "UI_ORIGIN",
      text: "https://solopulse-production.up.railway.app",
    },
    {
      type: "plain_text",
      name: "CF_API",
      text: "https://solopulse-api.paekfeel.workers.dev",
    },
    {
      type: "plain_text",
      name: "PUBLIC_URL",
      text: "https://solopulse.paekfeel.workers.dev",
    },
    { type: "plain_text", name: "APP_NAME", text: "SoloPulse" },
    {
      type: "service",
      name: "BOARD_API",
      service: "solopulse-api",
      environment: "production",
    },
  ],
};

const form = new FormData();
form.append(
  "metadata",
  new Blob([JSON.stringify(meta)], { type: "application/json" }),
  "metadata.json"
);
form.append(
  "index.js",
  new Blob([script], { type: "application/javascript+module" }),
  "index.js"
);

const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/solopulse?include_subdomain_availability=true&excludeScript=true`;
const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const j = await res.json();
console.log(
  JSON.stringify(
    { http: res.status, success: j.success, errors: j.errors, resultId: j.result?.id },
    null,
    2
  )
);
if (!j.success) process.exit(1);
