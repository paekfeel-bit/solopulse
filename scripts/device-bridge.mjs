/**
 * SoloPulse Device Bridge — permanent home-side fix
 *
 * - Auto-discovers AxeOS miner on LAN (survives DHCP IP changes)
 * - Proxies miner HTTP on localhost:8787
 * - Keeps cloudflared tunnel alive (auto-restart)
 * - Publishes live tunnel URL to JSONBlob registry (Vercel reads it — no redeploy)
 *
 * Forever: start-device-bridge.bat
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.BRIDGE_PORT || 8787);
const SUBNET = process.env.MINER_SUBNET || "172.30.1";
/** Fixed public registry — Vercel app reads this every connect */
const REGISTRY_URL = (
  process.env.TUNNEL_REGISTRY_URL ||
  "https://jsonblob.com/api/jsonBlob/019f9eef-8d49-74f0-8ae5-6de62414b41b"
).trim();
const LOG_DIR = path.join(ROOT, "export");
fs.mkdirSync(LOG_DIR, { recursive: true });

let minerIp = process.env.MINER_IP || "";
let tunnelUrl = "";
let cloudProc = null;
let lastDiscover = 0;

function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(" ")}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(LOG_DIR, "device-bridge.log"), line + "\n");
  } catch {
    /* */
  }
}

function saveState() {
  const state = {
    minerIp,
    tunnelUrl,
    registry: REGISTRY_URL,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(LOG_DIR, "device-bridge-state.json"),
    JSON.stringify(state, null, 2)
  );
  if (tunnelUrl) {
    fs.writeFileSync(
      path.join(LOG_DIR, "miner-tunnel-url.txt"),
      tunnelUrl + "\n"
    );
  }
}

function tcpOpen(ip, port, ms) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port }, () => {
      s.destroy();
      resolve(true);
    });
    s.setTimeout(ms, () => {
      s.destroy();
      resolve(false);
    });
    s.on("error", () => {
      s.destroy();
      resolve(false);
    });
  });
}

function request(method, url, bodyObj, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const body = bodyObj != null ? JSON.stringify(bodyObj) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        timeout: timeoutMs,
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "SoloPulse-Bridge/2",
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: d,
            headers: res.headers,
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function discoverMiner() {
  const prefer = [16, 8, 99, 67, 66, 97, 96, 10, 1, 100, 50, 20, 29, 74, 2];
  const ips = [];
  for (const d of prefer) ips.push(`${SUBNET}.${d}`);
  for (let d = 1; d <= 254; d++) {
    if (!prefer.includes(d)) ips.push(`${SUBNET}.${d}`);
  }

  if (minerIp) {
    try {
      const r = await request("GET", `http://${minerIp}/api/system/info`, null, 1500);
      if (r.status === 200 && /hashRate|NerdQ|deviceModel|ASIC/i.test(r.body)) {
        return minerIp;
      }
    } catch {
      /* */
    }
  }

  for (let i = 0; i < ips.length; i += 48) {
    const chunk = ips.slice(i, i + 48);
    const open = (
      await Promise.all(
        chunk.map(async (ip) => ((await tcpOpen(ip, 80, 180)) ? ip : null))
      )
    ).filter(Boolean);

    for (const ip of open) {
      try {
        const r = await request("GET", `http://${ip}/api/system/info`, null, 1500);
        if (r.status === 200 && /hashRate|NerdQ|deviceModel|ASIC/i.test(r.body)) {
          log("discovered miner", ip);
          return ip;
        }
      } catch {
        /* */
      }
    }
  }
  return null;
}

async function ensureMiner() {
  const now = Date.now();
  if (minerIp && now - lastDiscover < 20_000) {
    try {
      const r = await request("GET", `http://${minerIp}/api/system/info`, null, 2000);
      if (r.status === 200 && /hashRate|NerdQ|deviceModel/i.test(r.body)) {
        return minerIp;
      }
    } catch {
      /* */
    }
  }
  lastDiscover = now;
  const found = await discoverMiner();
  if (found && found !== minerIp) {
    minerIp = found;
    saveState();
    log("miner IP updated →", minerIp);
  } else if (found) {
    minerIp = found;
  }
  return minerIp;
}

function proxyToMiner(req, res, targetPath) {
  if (!minerIp) {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ online: false, error: "miner not found on LAN" }));
    return;
  }
  const p = http.request(
    {
      hostname: minerIp,
      port: 80,
      path: targetPath,
      method: req.method,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "SoloPulse-Bridge/2",
      },
      timeout: 12000,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        "Content-Type": up.headers["content-type"] || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      up.pipe(res);
    }
  );
  p.on("error", (e) => {
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({ online: false, error: String(e.message || e), minerIp })
    );
  });
  p.on("timeout", () => {
    p.destroy();
    res.writeHead(504, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ online: false, error: "miner timeout", minerIp }));
  });
  if (req.method === "POST" || req.method === "PUT") req.pipe(p);
  else p.end();
}

async function publishRegistry() {
  if (!tunnelUrl) return;
  const payload = {
    tunnel: tunnelUrl,
    minerIp,
    updatedAt: new Date().toISOString(),
    app: "solopulse",
  };
  try {
    // Try PUT to fixed blob
    let r = await request("PUT", REGISTRY_URL, payload, 15000);
    if (r.status >= 200 && r.status < 300) {
      log("registry PUT ok", REGISTRY_URL);
      return;
    }
    // Create if missing
    r = await request("POST", "https://jsonblob.com/api/jsonBlob", payload, 15000);
    const loc = r.headers.location || r.headers.Location;
    log("registry POST", r.status, loc || r.body.slice(0, 80));
    // Still try put again (id may be in response)
    if (loc) {
      const full = loc.startsWith("http")
        ? loc
        : "https://jsonblob.com" + loc;
      await request("PUT", full, payload, 15000);
      fs.writeFileSync(path.join(LOG_DIR, "tunnel-registry-url.txt"), full + "\n");
    }
    // Always also put fixed URL again after create path
    await request("PUT", REGISTRY_URL, payload, 15000);
  } catch (e) {
    log("registry error", e.message || e);
  }
}

function startCloudflared() {
  if (cloudProc && !cloudProc.killed) {
    try {
      cloudProc.kill();
    } catch {
      /* */
    }
  }
  const args = [
    "--yes",
    "cloudflared",
    "tunnel",
    "--url",
    `http://127.0.0.1:${PORT}`,
  ];
  log("starting cloudflared → bridge", PORT);
  cloudProc = spawn("npx", args, {
    cwd: ROOT,
    shell: true,
    windowsHide: true,
  });

  const onData = (buf) => {
    const s = buf.toString();
    process.stdout.write(s);
    const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== tunnelUrl) {
      tunnelUrl = m[0];
      log("TUNNEL", tunnelUrl);
      saveState();
      void publishRegistry();
    }
  };
  cloudProc.stdout.on("data", onData);
  cloudProc.stderr.on("data", onData);
  cloudProc.on("exit", (code) => {
    log("cloudflared exited", code, "— restart in 3s");
    cloudProc = null;
    setTimeout(() => startCloudflared(), 3000);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (u.pathname === "/health" || u.pathname === "/bridge/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        minerIp,
        tunnelUrl,
        registry: REGISTRY_URL,
        updatedAt: new Date().toISOString(),
      })
    );
    return;
  }

  if (u.pathname.startsWith("/api/system")) {
    await ensureMiner();
    proxyToMiner(req, res, u.pathname + u.search);
    return;
  }

  if (u.pathname === "/api/device") {
    await ensureMiner();
    if (!minerIp) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ online: false, error: "no miner on LAN" }));
      return;
    }
    try {
      const r = await request("GET", `http://${minerIp}/api/system/info`, null, 8000);
      const raw = JSON.parse(r.body);
      const hr = Number(raw.hashRate || raw.hashrate || 0);
      const ghs = hr >= 1e11 ? hr / 1e9 : hr;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          online: true,
          live: true,
          ip: minerIp,
          deviceModel: raw.deviceModel || raw.ASICModel || "AxeOS",
          hashRateGhs: ghs,
          hashRateHs: ghs * 1e9,
          windows: {
            instantGhs: ghs,
            m1Ghs: ghs,
            m10Ghs: ghs,
            h1Ghs: ghs,
            d1Ghs: ghs,
          },
          temp: Number(raw.temp) || null,
          power: Number(raw.power) || null,
          bestDiff: Number(raw.bestDiff) || 0,
          bestSessionDiff: Number(raw.bestSessionDiff) || 0,
          networkDifficulty: Number(raw.networkDifficulty) || 0,
          foundBlocks: Number(raw.foundBlocks) || 0,
          totalFoundBlocks: Number(raw.totalFoundBlocks) || 0,
          sharesAccepted: Number(raw.sharesAccepted) || 0,
          sharesRejected: Number(raw.sharesRejected) || 0,
          fetchedAt: Date.now(),
          via: "bridge",
        })
      );
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          online: false,
          error: String(e.message || e),
          minerIp,
        })
      );
    }
    return;
  }

  if (u.pathname === "/api/device/scan") {
    const ip = await ensureMiner();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        found: ip
          ? [
              {
                ip,
                connectIp: tunnelUrl || ip,
                deviceModel: "AxeOS",
                via: tunnelUrl ? "bridge-tunnel" : "lan",
              },
            ]
          : [],
        note: ip ? `miner ${ip}` : "not found",
        tunnel: tunnelUrl,
        cloud: false,
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", path: u.pathname }));
});

async function main() {
  log("SoloPulse device bridge starting…");
  // Seed registry blob (create if 404)
  try {
    const probe = await request("GET", REGISTRY_URL, null, 10000);
    if (probe.status === 404 || probe.status === 400) {
      await request(
        "POST",
        "https://jsonblob.com/api/jsonBlob",
        { tunnel: "", minerIp: "", app: "solopulse", note: "init" },
        10000
      );
    }
  } catch {
    /* */
  }

  minerIp = (await discoverMiner()) || "";
  log("minerIp=", minerIp || "(searching…)");
  saveState();

  server.listen(PORT, "0.0.0.0", () => {
    log(`bridge http://127.0.0.1:${PORT}`);
    startCloudflared();
  });

  setInterval(() => {
    void ensureMiner();
  }, 30_000);

  setInterval(() => {
    void publishRegistry();
  }, 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
