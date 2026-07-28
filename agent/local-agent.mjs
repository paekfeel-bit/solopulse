/**
 * SoloPulse Local Agent
 * Runs on the SAME LAN as the miner. Cloud never opens 172.x.
 *
 * Usage:
 *   set SOLOPULSE_CLOUD_URL=https://your-app.up.railway.app
 *   set SOLOPULSE_AGENT_KEY=your-secret
 *   node agent/local-agent.mjs
 *
 * Or: start-local-agent.bat
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import { randomUUID } from "node:crypto";

const CLOUD =
  (process.env.SOLOPULSE_CLOUD_URL || process.env.CLOUD_URL || "http://localhost:3000")
    .replace(/\/$/, "");
const KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";
const SUBNET = process.env.MINER_SUBNET || "172.30.1";
const HINT_IP = process.env.MINER_IP || "";
const POLL_MS = Number(process.env.POLL_MS || 2500);
const AGENT_ID = process.env.AGENT_ID || `agent-${os.hostname()}-${randomUUID().slice(0, 8)}`;
const VERSION = "2.0.0";

let minerIp = HINT_IP;
let status = "STARTING";
let lastError = null;

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

function request(method, url, bodyObj, headers = {}, timeoutMs = 12000) {
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
          Accept: "application/json",
          "User-Agent": `SoloPulse-LocalAgent/${VERSION}`,
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body: d })
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

async function discoverMiner() {
  status = "DISCOVERING";
  const prefer = [16, 8, 99, 67, 66, 97, 96, 10, 1, 100, 50, 20, 29, 74, 2];
  const ips = [];
  if (HINT_IP) ips.push(HINT_IP);
  if (minerIp) ips.push(minerIp);
  for (const d of prefer) ips.push(`${SUBNET}.${d}`);
  for (let d = 1; d <= 254; d++) {
    if (!prefer.includes(d)) ips.push(`${SUBNET}.${d}`);
  }
  const seen = new Set();
  const list = ips.filter((ip) => {
    if (seen.has(ip)) return false;
    seen.add(ip);
    return true;
  });

  for (let i = 0; i < list.length; i += 40) {
    const chunk = list.slice(i, i + 40);
    const open = (
      await Promise.all(
        chunk.map(async (ip) => ((await tcpOpen(ip, 80, 200)) ? ip : null))
      )
    ).filter(Boolean);
    for (const ip of open) {
      try {
        const r = await request("GET", `http://${ip}/api/system/info`, null, {}, 2000);
        if (r.status === 200 && /hashRate|NerdQ|deviceModel|ASIC/i.test(r.body)) {
          status = "DEVICE_FOUND";
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

function parseAxe(raw, ip) {
  const ghs = toGhs(raw.hashRate ?? raw.hashrate ?? raw.hash_rate);
  const ghs1 = toGhs(raw.hashRate_1m ?? raw.hashrate_1m) || ghs;
  const ghs10 = toGhs(raw.hashRate_10m ?? raw.hashrate_10m) || ghs;
  const ghs1h = toGhs(raw.hashRate_1h ?? raw.hashrate_1h) || ghs;
  const ghs1d = toGhs(raw.hashRate_1d ?? raw.hashrate_1d) || ghs;
  const temp = Number(raw.temp ?? raw.temperature ?? raw.tempBoard);
  const power = Number(raw.power);
  const fan = Number(raw.fanspeed ?? raw.fanrpm ?? raw.fanRpm);
  return {
    schemaVersion: 1,
    deviceId: String(raw.macAddr || raw.hostname || ip),
    deviceModel: String(raw.deviceModel || raw.ASICModel || raw.hostname || "AxeOS"),
    hostIp: String(raw.hostip || ip),
    hashRateGhs: ghs,
    hashRateHs: ghs * 1e9,
    windows: {
      instantGhs: ghs || ghs1,
      m1Ghs: ghs1,
      m10Ghs: ghs10,
      h1Ghs: ghs1h,
      d1Ghs: ghs1d,
    },
    tempC: Number.isFinite(temp) && temp > 0 ? temp : null,
    powerW: Number.isFinite(power) ? power : null,
    fanRpm: Number.isFinite(fan) && fan > 0 ? fan : null,
    bestDiff: Number(raw.bestDiff) || 0,
    bestSessionDiff: Number(raw.bestSessionDiff) || 0,
    networkDifficulty: Number(raw.networkDifficulty) || 0,
    sharesAccepted: Number(raw.sharesAccepted) || 0,
    sharesRejected: Number(raw.sharesRejected) || 0,
    foundBlocks: Number(raw.foundBlocks) || 0,
    totalFoundBlocks: Number(raw.totalFoundBlocks) || 0,
    uptimeSec: Number.isFinite(Number(raw.uptimeSeconds ?? raw.uptime))
      ? Number(raw.uptimeSeconds ?? raw.uptime)
      : null,
    firmware: raw.version != null ? String(raw.version) : null,
    collectedAt: Date.now(),
    agentId: AGENT_ID,
    agentStatus: "STREAMING",
    source: "axeos",
  };
}

async function pushTelemetry(tel) {
  const r = await request(
    "POST",
    `${CLOUD}/api/agent/telemetry`,
    tel,
    { "x-agent-key": KEY },
    15000
  );
  if (r.status >= 300) {
    throw new Error(`telemetry HTTP ${r.status}: ${r.body.slice(0, 120)}`);
  }
}

async function pushHeartbeat(extra = {}) {
  const r = await request(
    "POST",
    `${CLOUD}/api/agent/heartbeat`,
    {
      agentId: AGENT_ID,
      status,
      hostname: os.hostname(),
      platform: process.platform,
      version: VERSION,
      devices: minerIp ? [minerIp] : [],
      ts: Date.now(),
      lastError,
      ...extra,
    },
    { "x-agent-key": KEY },
    10000
  );
  if (r.status >= 300) {
    throw new Error(`heartbeat HTTP ${r.status}`);
  }
}

async function tick() {
  try {
    if (!CLOUD || !/^https?:\/\//i.test(CLOUD)) {
      lastError = `invalid CLOUD url: ${CLOUD}`;
      status = "ERROR";
      log(lastError);
      return;
    }
    if (!minerIp) {
      minerIp = await discoverMiner();
      if (!minerIp) {
        status = "DEVICE_OFFLINE";
        lastError = "no AxeOS on LAN";
        await pushHeartbeat().catch(() => {});
        return;
      }
    }
    status = "CONNECTING";
    const minerUrl = `http://${minerIp}/api/system/info`;
    const r = await request("GET", minerUrl, null, {}, 8000);
    if (r.status !== 200) {
      throw new Error(`miner HTTP ${r.status}`);
    }
    const raw = JSON.parse(r.body);
    const tel = parseAxe(raw, minerIp);
    status = "STREAMING";
    lastError = null;
    await pushTelemetry(tel);
    await pushHeartbeat();
    log(
      `stream ${minerIp} ${tel.hashRateGhs.toFixed(1)} GH/s ${tel.tempC ?? "—"}°C → ${CLOUD}`
    );
  } catch (e) {
    lastError = e.message || String(e);
    log("tick error", lastError);
    status = "RECONNECTING";
    // re-discover on repeated failures
    if (/timeout|ECONNREFUSED|ENOTFOUND|HTTP/i.test(lastError)) {
      minerIp = "";
      status = "DISCOVERING";
    }
    await pushHeartbeat().catch(() => {});
  }
}

async function main() {
  log("SoloPulse Local Agent", VERSION);
  log("CLOUD=", CLOUD);
  log("AGENT_ID=", AGENT_ID);
  log("KEY=", KEY.slice(0, 4) + "…" + KEY.slice(-4));
  status = "STARTING";
  minerIp = (await discoverMiner()) || "";
  if (minerIp) log("initial miner", minerIp);
  else log("miner not found yet — will keep scanning");

  await tick();
  setInterval(() => {
    void tick();
  }, POLL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
