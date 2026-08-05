/**
 * SoloPulse Home Agent — permanent cloud path (Cloudflare only)
 *
 * Polls AxeOS on LAN → pushes to Cloudflare SoloRoom:
 *   1) WebSocket  wss://solopulse-api.paekfeel.workers.dev/ws
 *   2) HTTP POST  https://solopulse-api.paekfeel.workers.dev/api/agent/telemetry
 *
 * Env:
 *   MINER_IP / MINER_SUBNET
 *   SOLOPULSE_WS / RAILWAY_WS (legacy name) default CF
 *   SOLOPULSE_API_URL default https://solopulse-api.paekfeel.workers.dev
 *   SOLOPULSE_AGENT_KEY default solopulse-local-dev-key
 *   CLIENT_ID (optional wallet)
 *   POLL_MS default 2500
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import WebSocket from "ws";

const MINER_IP = process.env.MINER_IP || "";
const SUBNET = process.env.MINER_SUBNET || "172.30.1";
const CF_API = (
  process.env.SOLOPULSE_API_URL ||
  "https://solopulse-api.paekfeel.workers.dev"
).replace(/\/$/, "");
const WS_BASE = (
  process.env.SOLOPULSE_WS ||
  process.env.RAILWAY_WS ||
  process.env.CF_WS ||
  `${CF_API.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/ws`
).replace(/\/$/, "");
const KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";
const CLIENT_ID =
  process.env.CLIENT_ID || process.env.PAYOUT_ADDRESS || "default";
const POLL_MS = Number(process.env.POLL_MS || 2500);

let minerIp = MINER_IP;
let ws = null;
let timer = null;
let lastPostOk = 0;
let consecutiveFails = 0;

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
        headers: {
          Accept: "application/json",
          "User-Agent": "SoloPulse-Bridge/cf-1",
        },
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

function tcpOpen(ip, ms = 250) {
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
      if (r.status === 200 && /hashRate|NerdQ|deviceModel/i.test(r.body))
        return minerIp;
    } catch {
      /* */
    }
  }
  const prefer = [85, 14, 16, 33, 70, 56, 50, 8, 99, 67, 66, 10, 1, 100];
  const ips = prefer.map((d) => `${SUBNET}.${d}`);
  for (let d = 1; d <= 254; d++) {
    if (!prefer.includes(d)) ips.push(`${SUBNET}.${d}`);
  }
  for (let i = 0; i < ips.length; i += 48) {
    const chunk = ips.slice(i, i + 48);
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

function postJson(path, obj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(obj);
    const u = new URL(path.startsWith("http") ? path : `${CF_API}${path}`);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        timeout: 10000,
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
  const url = `${WS_BASE}?role=bridge&clientId=${encodeURIComponent(CLIENT_ID)}&key=${encodeURIComponent(KEY)}`;
  log("connecting", url.replace(KEY, "***"));
  try {
    ws = new WebSocket(url);
  } catch (e) {
    log("WS construct fail", e.message);
    setTimeout(connectWs, 4000);
    return;
  }

  ws.on("open", () => {
    log("✅ Cloudflare SoloRoom connected");
    consecutiveFails = 0;
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
  try {
    if (!minerIp) minerIp = await discover();
    if (!minerIp) {
      log("no miner on LAN");
      return;
    }
    const r = await httpGet(`http://${minerIp}/api/system/info`, 5000);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const data = JSON.parse(r.body);
    const ghs = toGhs(data.hashRate ?? data.hashrate);
    const now = Date.now();
    const payloadData = {
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
    };
    const wsPacket = {
      type: "miner_data",
      clientId: CLIENT_ID,
      agentId: "bridge",
      data: payloadData,
    };

    // 1) WebSocket (live fan-out to browsers)
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(wsPacket));
      } catch (e) {
        log("ws send fail", e.message);
      }
    }

    // 2) HTTP always (durable cloud snapshot — works even if WS drops)
    // SoloRoom ingest accepts {clientId, data} or flat telemetry
    try {
      await postJson("/api/agent/telemetry", {
        clientId: CLIENT_ID,
        agentId: "bridge",
        agentStatus: "STREAMING",
        deviceId: payloadData.hostIp,
        deviceModel: payloadData.deviceModel,
        hostIp: payloadData.hostIp,
        hashRateGhs: ghs,
        hashRateHs: ghs * 1e9,
        tempC: payloadData.temp,
        powerW: payloadData.power,
        bestDiff: payloadData.bestDiff,
        bestSessionDiff: payloadData.bestSessionDiff,
        networkDifficulty: payloadData.networkDifficulty,
        sharesAccepted: payloadData.sharesAccepted,
        sharesRejected: payloadData.sharesRejected,
        foundBlocks: payloadData.foundBlocks,
        totalFoundBlocks: payloadData.totalFoundBlocks,
        uptimeSec: payloadData.uptime,
        collectedAt: now,
        source: "axeos",
        data: payloadData,
      });
      lastPostOk = now;
    } catch (e) {
      // also try DO ingest shape
      try {
        await postJson("/api/agent/telemetry", {
          clientId: CLIENT_ID,
          data: payloadData,
        });
        lastPostOk = Date.now();
      } catch (e2) {
        log("HTTP ingest fail", e2.message || e.message);
      }
    }

    consecutiveFails = 0;
    log(`→ CF ${minerIp} ${ghs.toFixed(1)} GH/s ${data.temp ?? "—"}°C`);
  } catch (e) {
    consecutiveFails++;
    log("tick fail", e.message);
    if (consecutiveFails >= 3) minerIp = "";
  }
}

// HTTP-only loop if WS never opens (still keep cloud snapshot alive)
function ensureHttpLoop() {
  setInterval(() => {
    if (!ws || ws.readyState !== 1) void tick();
  }, Math.max(POLL_MS, 5000));
}

log("SoloPulse Home Agent → Cloudflare");
log("WS=", WS_BASE);
log("API=", CF_API);
log("CLIENT_ID=", CLIENT_ID);
connectWs();
ensureHttpLoop();
