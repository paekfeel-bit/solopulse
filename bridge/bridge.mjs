/**
 * SoloPulse Local Bridge (Method 1)
 * PC/RPi on same LAN as NerdQAxe → WebSocket → Railway
 *
 *   node bridge/bridge.mjs
 *
 * Env:
 *   MINER_IP=172.30.1.50          (optional — auto-discover if empty)
 *   MINER_SUBNET=172.30.1
 *   RAILWAY_WS=wss://solopulse-production.up.railway.app/ws
 *   SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
 *   CLIENT_ID=bc1q...             (optional; defaults to payout-less "default")
 *   POLL_MS=3000
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import WebSocket from "ws";

const MINER_IP = process.env.MINER_IP || "";
const SUBNET = process.env.MINER_SUBNET || "172.30.1";
const RAILWAY_WS = (
  process.env.RAILWAY_WS ||
  process.env.SOLOPULSE_WS ||
  "wss://solopulse-production.up.railway.app/ws"
).replace(/\/$/, "");
const KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";
const CLIENT_ID = process.env.CLIENT_ID || process.env.PAYOUT_ADDRESS || "default";
const POLL_MS = Number(process.env.POLL_MS || 3000);
const CLOUD_HTTP = (
  process.env.SOLOPULSE_CLOUD_URL ||
  process.env.CLOUD_URL ||
  RAILWAY_WS.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/ws\/?$/, "")
).replace(/\/$/, "");

let minerIp = MINER_IP;
let ws = null;
let timer = null;
let lastPostOk = 0;

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        timeout: timeoutMs,
        headers: { Accept: "application/json", "User-Agent": "SoloPulse-Bridge/1" },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: d }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function tcpOpen(ip, ms = 200) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: 80 }, () => {
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

async function discover() {
  if (minerIp) {
    try {
      const r = await httpGet(`http://${minerIp}/api/system/info`, 2000);
      if (r.status === 200 && /hashRate|NerdQ|deviceModel/i.test(r.body)) return minerIp;
    } catch {
      /* */
    }
  }
  const prefer = [33, 70, 56, 50, 16, 8, 99, 67, 66, 10, 1, 100];
  const ips = prefer.map((d) => `${SUBNET}.${d}`);
  for (let d = 1; d <= 254; d++) {
    if (!prefer.includes(d)) ips.push(`${SUBNET}.${d}`);
  }
  for (let i = 0; i < ips.length; i += 40) {
    const chunk = ips.slice(i, i + 40);
    const open = (
      await Promise.all(chunk.map(async (ip) => ((await tcpOpen(ip)) ? ip : null)))
    ).filter(Boolean);
    for (const ip of open) {
      try {
        const r = await httpGet(`http://${ip}/api/system/info`, 1500);
        if (r.status === 200 && /hashRate|NerdQ|deviceModel/i.test(r.body)) {
          log("found miner", ip);
          return ip;
        }
      } catch {
        /* */
      }
    }
  }
  return null;
}

function toGhs(n) {
  const x = Number(n) || 0;
  if (x <= 0) return 0;
  if (x >= 1e11) return x / 1e9;
  return x;
}

function postTelemetryHttp(data, ghs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      deviceId: String(data.hostIp || minerIp || "device"),
      deviceModel: String(data.deviceModel || "NerdQAxe"),
      hostIp: String(data.hostIp || minerIp || ""),
      hashRateGhs: ghs,
      hashRateHs: ghs * 1e9,
      windows: {
        instantGhs: ghs,
        m1Ghs: ghs,
        m10Ghs: ghs,
        h1Ghs: ghs,
        d1Ghs: ghs,
      },
      tempC: data.temp != null ? Number(data.temp) : null,
      powerW: data.power != null ? Number(data.power) : null,
      fanRpm: null,
      bestDiff: Number(data.bestDiff || data.bestshare) || 0,
      bestSessionDiff: Number(data.bestSessionDiff) || 0,
      networkDifficulty: Number(data.networkDifficulty) || 0,
      sharesAccepted: Number(data.sharesAccepted) || 0,
      sharesRejected: Number(data.sharesRejected) || 0,
      foundBlocks: Number(data.foundBlocks) || 0,
      totalFoundBlocks: Number(data.totalFoundBlocks) || 0,
      uptimeSec: data.uptime != null ? Number(data.uptime) : null,
      firmware: null,
      collectedAt: Number(data.timestamp) || Date.now(),
      agentId: "bridge",
      agentStatus: "STREAMING",
      source: "axeos",
    });
    const u = new URL(`${CLOUD_HTTP}/api/agent/telemetry`);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname,
        method: "POST",
        timeout: 8000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-agent-key": KEY,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300)
            resolve();
          else reject(new Error(`POST ${res.statusCode}`));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("post timeout"));
    });
    req.write(body);
    req.end();
  });
}

function connectWs() {
  const url = `${RAILWAY_WS}?role=bridge&clientId=${encodeURIComponent(CLIENT_ID)}&key=${encodeURIComponent(KEY)}`;
  log("connecting", url.replace(KEY, "***"));
  ws = new WebSocket(url);

  ws.on("open", () => {
    log("✅ Railway WebSocket connected");
    if (timer) clearInterval(timer);
    timer = setInterval(() => void tick(), POLL_MS);
    void tick();
  });

  ws.on("close", () => {
    log("WS closed — reconnect in 3s");
    if (timer) clearInterval(timer);
    timer = null;
    setTimeout(connectWs, 3000);
  });

  ws.on("error", (err) => {
    log("WS error", err.message);
  });

  ws.on("message", (buf) => {
    try {
      const p = JSON.parse(String(buf));
      if (p.type === "hello") log("server hello", p);
    } catch {
      /* */
    }
  });
}

async function tick() {
  if (!ws || ws.readyState !== 1) return;
  try {
    if (!minerIp) minerIp = await discover();
    if (!minerIp) {
      ws.send(
        JSON.stringify({
          type: "miner_offline",
          clientId: CLIENT_ID,
          agentId: "bridge",
        })
      );
      return;
    }
    const r = await httpGet(`http://${minerIp}/api/system/info`, 5000);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const data = JSON.parse(r.body);
    const ghs = toGhs(data.hashRate ?? data.hashrate);
    const now = Date.now();
    const payload = {
      type: "miner_data",
      clientId: CLIENT_ID,
      agentId: "bridge",
      data: {
        hashrate: ghs,
        hashRateGhs: ghs,
        bestshare: data.bestDiff ?? data.bestshare,
        bestDiff: data.bestDiff,
        bestSessionDiff: data.bestSessionDiff,
        temp: data.temp,
        power: data.power,
        uptime: data.uptimeSeconds ?? data.uptime,
        hostIp: data.hostip || minerIp,
        deviceModel: data.deviceModel || data.ASICModel,
        sharesAccepted: data.sharesAccepted,
        sharesRejected: data.sharesRejected,
        foundBlocks: data.foundBlocks,
        totalFoundBlocks: data.totalFoundBlocks,
        networkDifficulty: data.networkDifficulty,
        timestamp: now,
      },
    };
    ws.send(JSON.stringify(payload));

    // Dual-write HTTP so dashboard stays live even if WS store hiccups
    if (now - lastPostOk > 2000) {
      void postTelemetryHttp(payload.data, ghs)
        .then(() => {
          lastPostOk = Date.now();
        })
        .catch(() => {
          /* non-fatal */
        });
    }
    log(`→ ${minerIp} ${ghs.toFixed(1)} GH/s ${data.temp ?? "—"}°C`);
  } catch (e) {
    log("tick fail", e.message);
    minerIp = "";
    try {
      ws.send(
        JSON.stringify({
          type: "miner_offline",
          clientId: CLIENT_ID,
          error: e.message,
        })
      );
    } catch {
      /* */
    }
  }
}

log("SoloPulse Bridge");
log("WS=", RAILWAY_WS);
log("CLIENT_ID=", CLIENT_ID);
connectWs();
