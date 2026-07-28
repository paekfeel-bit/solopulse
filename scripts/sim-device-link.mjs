/**
 * SoloPulse device-link simulation
 * Proves: miner LAN → bridge → Railway WS/HTTP → /api/agent/telemetry stays ONLINE
 *
 *   node scripts/sim-device-link.mjs
 *   node scripts/sim-device-link.mjs --seconds 90 --interval 2000
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import WebSocket from "ws";

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return def;
}

const SECONDS = Number(arg("seconds", 75));
const INTERVAL = Number(arg("interval", 2500));
const CLOUD =
  (process.env.SOLOPULSE_CLOUD_URL || "https://solopulse-production.up.railway.app").replace(
    /\/$/,
    ""
  );
const WS_URL =
  process.env.RAILWAY_WS || `${CLOUD.replace(/^http/, "ws")}/ws`;
const KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";
const SUBNET = process.env.MINER_SUBNET || "172.30.1";
const CLIENT_ID = process.env.CLIENT_ID || "sim-default";

const results = {
  minerDirect: null,
  bridgeWs: null,
  browserWs: null,
  samples: [],
  failStreak: 0,
  maxFailStreak: 0,
  okCount: 0,
  failCount: 0,
};

function log(...a) {
  console.log(`[sim ${new Date().toISOString().slice(11, 19)}]`, ...a);
}

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: opts.headers || {},
        timeout: opts.timeout || 10000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body: d, headers: res.headers })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
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

async function findMiner() {
  if (process.env.MINER_IP) {
    try {
      const r = await request(`http://${process.env.MINER_IP}/api/system/info`, {
        timeout: 3000,
      });
      if (r.status === 200) return process.env.MINER_IP;
    } catch {
      /* */
    }
  }
  const prefer = [70, 56, 50, 16, 8, 99, 67, 66, 10, 1, 100];
  for (const d of prefer) {
    const ip = `${SUBNET}.${d}`;
    if (!(await tcpOpen(ip))) continue;
    try {
      const r = await request(`http://${ip}/api/system/info`, { timeout: 1500 });
      if (r.status === 200 && /hashRate|NerdQ|deviceModel/i.test(r.body)) return ip;
    } catch {
      /* */
    }
  }
  return null;
}

function waitWs(url, role, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const full = `${url}?role=${role}&clientId=${encodeURIComponent(CLIENT_ID)}&key=${encodeURIComponent(KEY)}`;
    const ws = new WebSocket(full);
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      resolve({ ok: false, error: "timeout", ws: null });
    }, timeoutMs);
    ws.on("open", () => {
      clearTimeout(t);
      resolve({ ok: true, ws });
    });
    ws.on("error", (e) => {
      clearTimeout(t);
      resolve({ ok: false, error: e.message, ws: null });
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollTelemetry() {
  const r = await request(
    `${CLOUD}/api/agent/telemetry?_=${Date.now()}`,
    {
      timeout: 12000,
      headers: { "Cache-Control": "no-cache", Accept: "application/json" },
    }
  );
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

async function main() {
  log("=== SoloPulse device-link simulation ===");
  log("cloud=", CLOUD);
  log("ws=", WS_URL);
  log("duration=", SECONDS, "s interval=", INTERVAL, "ms");

  // 1) Miner direct
  const minerIp = await findMiner();
  results.minerDirect = !!minerIp;
  if (!minerIp) {
    log("FAIL: no miner on LAN — cannot simulate full path");
    process.exitCode = 2;
    printSummary();
    return;
  }
  log("OK miner", minerIp);
  const info = JSON.parse(
    (await request(`http://${minerIp}/api/system/info`, { timeout: 4000 })).body
  );
  log(
    "  model=",
    info.deviceModel || info.ASICModel,
    "hashRate=",
    info.hashRate ?? info.hashrate
  );

  // 2) Bridge WS connect + inject one packet (if no external bridge, we act as bridge)
  const bridge = await waitWs(WS_URL, "bridge");
  results.bridgeWs = bridge.ok;
  if (!bridge.ok) {
    log("FAIL bridge WS", bridge.error);
    process.exitCode = 2;
    printSummary();
    return;
  }
  log("OK bridge WebSocket");

  // 3) Browser WS
  const browser = await waitWs(WS_URL, "browser");
  results.browserWs = browser.ok;
  let browserGotPacket = false;
  if (browser.ok) {
    browser.ws.on("message", (buf) => {
      try {
        const p = JSON.parse(String(buf));
        if (p.type === "miner_data") browserGotPacket = true;
      } catch {
        /* */
      }
    });
    browser.ws.send(JSON.stringify({ type: "subscribe", clientId: CLIENT_ID }));
    log("OK browser WebSocket");
  } else {
    log("WARN browser WS", browser.error);
  }

  // Continuous inject + poll
  const end = Date.now() + SECONDS * 1000;
  let n = 0;
  while (Date.now() < end) {
    n++;
    try {
      const r = await request(`http://${minerIp}/api/system/info`, { timeout: 4000 });
      const data = JSON.parse(r.body);
      const ghsRaw = Number(data.hashRate ?? data.hashrate) || 0;
      const ghs = ghsRaw >= 1e11 ? ghsRaw / 1e9 : ghsRaw;
      const packet = {
        type: "miner_data",
        clientId: CLIENT_ID,
        agentId: "sim-bridge",
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
          networkDifficulty: data.networkDifficulty,
          timestamp: Date.now(),
        },
      };
      if (bridge.ws?.readyState === 1) {
        bridge.ws.send(JSON.stringify(packet));
      } else {
        throw new Error("bridge WS not open");
      }

      // dual-write HTTP (same as production agent) for resilience check
      await request(`${CLOUD}/api/agent/telemetry`, {
        method: "POST",
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "x-agent-key": KEY,
        },
        body: JSON.stringify({
          schemaVersion: 1,
          deviceId: minerIp,
          deviceModel: packet.data.deviceModel,
          hostIp: minerIp,
          hashRateGhs: ghs,
          hashRateHs: ghs * 1e9,
          windows: {
            instantGhs: ghs,
            m1Ghs: ghs,
            m10Ghs: ghs,
            h1Ghs: ghs,
            d1Ghs: ghs,
          },
          tempC: packet.data.temp,
          powerW: packet.data.power,
          bestDiff: packet.data.bestDiff || 0,
          bestSessionDiff: packet.data.bestSessionDiff || 0,
          networkDifficulty: packet.data.networkDifficulty || 0,
          sharesAccepted: packet.data.sharesAccepted || 0,
          sharesRejected: packet.data.sharesRejected || 0,
          foundBlocks: packet.data.foundBlocks || 0,
          totalFoundBlocks: 0,
          uptimeSec: packet.data.uptime,
          collectedAt: Date.now(),
          agentId: "sim-bridge",
          agentStatus: "STREAMING",
          source: "axeos",
        }),
      });

      await sleep(800);
      const snap = await pollTelemetry();
      const ghsSnap = Number(snap?.telemetry?.hashRateGhs) || 0;
      const age = snap?.staleMs ?? 999999;
      const live =
        (snap?.online === true || snap?.agentOnline === true) &&
        ghsSnap > 0 &&
        age < 90_000;

      if (live) {
        results.okCount++;
        results.failStreak = 0;
        log(
          `PASS #${n} online ghs=${ghsSnap.toFixed(1)} host=${snap.telemetry?.hostIp} stale=${age}ms browserPkt=${browserGotPacket}`
        );
      } else {
        results.failCount++;
        results.failStreak++;
        results.maxFailStreak = Math.max(
          results.maxFailStreak,
          results.failStreak
        );
        log(
          `FAIL #${n} online=${snap?.online} agent=${snap?.agentOnline} ghs=${ghsSnap} stale=${age} status=${snap?.agentStatus}`
        );
      }
      results.samples.push({
        n,
        live,
        ghs: ghsSnap,
        staleMs: age,
        host: snap?.telemetry?.hostIp,
      });
    } catch (e) {
      results.failCount++;
      results.failStreak++;
      results.maxFailStreak = Math.max(results.maxFailStreak, results.failStreak);
      log(`FAIL #${n} exception`, e.message || e);
      results.samples.push({ n, live: false, error: String(e.message || e) });
    }
    await sleep(INTERVAL);
  }

  try {
    bridge.ws?.close();
  } catch {
    /* */
  }
  try {
    browser.ws?.close();
  } catch {
    /* */
  }

  printSummary();
  const total = results.okCount + results.failCount;
  const rate = total ? results.okCount / total : 0;
  // Require: miner+bridge ok, >=95% samples live, no fail streak > 2
  const pass =
    results.minerDirect &&
    results.bridgeWs &&
    rate >= 0.95 &&
    results.maxFailStreak <= 2 &&
    results.okCount >= 5;

  if (!pass) {
    process.exitCode = 1;
    log("RESULT: UNSTABLE — fix required");
  } else {
    process.exitCode = 0;
    log("RESULT: STABLE — device link OK");
  }
}

function printSummary() {
  console.log("\n========== SUMMARY ==========");
  console.log(JSON.stringify(results, null, 2));
  const total = results.okCount + results.failCount;
  console.log(
    `passRate=${total ? ((100 * results.okCount) / total).toFixed(1) : 0}% ok=${results.okCount} fail=${results.failCount} maxFailStreak=${results.maxFailStreak}`
  );
  console.log("=============================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
