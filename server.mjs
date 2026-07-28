/**
 * SoloPulse production server for Railway
 * - Next.js HTTP
 * - WebSocket /ws for Local Bridge → cloud → browsers
 *
 * Env:
 *   PORT (Railway)
 *   SOLOPULSE_AGENT_KEY
 *   HOSTNAME=0.0.0.0
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { putTelemetry, putHeartbeat, getSnapshot } from "./server-agent-store.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const AGENT_KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/** clientId → Set of browser websockets watching that miner */
const watchers = new Map();
/** clientId → last miner payload */
const lastMiner = new Map();
/** bridge sockets */
const bridges = new Set();

function verifyKey(key) {
  return key && key === AGENT_KEY;
}

function broadcast(clientId, packet) {
  const set = watchers.get(clientId);
  if (!set) return;
  const msg = JSON.stringify(packet);
  for (const ws of set) {
    if (ws.readyState === 1) {
      try {
        ws.send(msg);
      } catch {
        /* */
      }
    }
  }
}

function telFromBridge(clientId, data) {
  const ghs = Number(data.hashrate ?? data.hashRateGhs ?? data.hashRate) || 0;
  const ghsNorm = ghs >= 1e11 ? ghs / 1e9 : ghs;
  return {
    schemaVersion: 1,
    deviceId: String(data.deviceId || data.hostIp || clientId),
    deviceModel: String(data.deviceModel || data.model || "NerdQAxe"),
    hostIp: String(data.hostIp || data.ip || ""),
    hashRateGhs: ghsNorm,
    hashRateHs: ghsNorm * 1e9,
    windows: {
      instantGhs: ghsNorm,
      m1Ghs: Number(data.hashrate1m || ghsNorm) || ghsNorm,
      m10Ghs: Number(data.hashrate10m || ghsNorm) || ghsNorm,
      h1Ghs: Number(data.hashrate1h || ghsNorm) || ghsNorm,
      d1Ghs: Number(data.hashrate1d || ghsNorm) || ghsNorm,
    },
    tempC:
      data.temp != null || data.tempC != null
        ? Number(data.temp ?? data.tempC)
        : null,
    powerW:
      data.power != null || data.powerW != null
        ? Number(data.power ?? data.powerW)
        : null,
    fanRpm: data.fanRpm != null ? Number(data.fanRpm) : null,
    bestDiff: Number(data.bestshare ?? data.bestDiff) || 0,
    bestSessionDiff: Number(data.bestSessionDiff) || 0,
    networkDifficulty: Number(data.networkDifficulty) || 0,
    sharesAccepted: Number(data.sharesAccepted) || 0,
    sharesRejected: Number(data.sharesRejected) || 0,
    foundBlocks: Number(data.foundBlocks) || 0,
    totalFoundBlocks: Number(data.totalFoundBlocks) || 0,
    uptimeSec: data.uptime != null ? Number(data.uptime) : null,
    firmware: data.firmware != null ? String(data.firmware) : null,
    collectedAt: Number(data.timestamp) || Date.now(),
    agentId: String(data.agentId || "ws-bridge"),
    agentStatus: "STREAMING",
    source: "axeos",
  };
}

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error("HTTP error", err);
    res.statusCode = 500;
    res.end("internal error");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/ws", `http://${req.headers.host || "localhost"}`);
  const role = url.searchParams.get("role") || "browser"; // browser | bridge
  const clientId = url.searchParams.get("clientId") || "default";
  const key = url.searchParams.get("key") || "";

  ws.role = role;
  ws.clientId = clientId;

  if (role === "bridge") {
    if (!verifyKey(key)) {
      ws.send(JSON.stringify({ type: "error", error: "unauthorized" }));
      ws.close();
      return;
    }
    bridges.add(ws);
    console.log("[ws] bridge connected", clientId);
    ws.send(JSON.stringify({ type: "hello", role: "bridge", ok: true }));
  } else {
    if (!watchers.has(clientId)) watchers.set(clientId, new Set());
    watchers.get(clientId).add(ws);
    console.log("[ws] browser watch", clientId);
    // catch-up last packet
    const last = lastMiner.get(clientId);
    if (last) {
      try {
        ws.send(JSON.stringify(last));
      } catch {
        /* */
      }
    }
    ws.send(
      JSON.stringify({
        type: "hello",
        role: "browser",
        ok: true,
        hasBridge: bridges.size > 0,
      })
    );
  }

  ws.on("message", async (raw) => {
    let packet;
    try {
      packet = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (ws.role === "bridge") {
      if (packet.type === "miner_data" || packet.type === "telemetry") {
        const cid = String(packet.clientId || clientId);
        const data = packet.data || packet.telemetry || {};
        const out = {
          type: "miner_data",
          clientId: cid,
          data,
          ts: Date.now(),
        };
        lastMiner.set(cid, out);
        broadcast(cid, out);
        // also feed HTTP snapshot store for REST clients
        try {
          const tel = telFromBridge(cid, { ...data, agentId: packet.agentId });
          await putTelemetry(tel);
          await putHeartbeat({
            agentId: String(packet.agentId || "ws-bridge"),
            status: "STREAMING",
            version: "ws-1",
            devices: [String(data.hostIp || data.ip || "")].filter(Boolean),
            ts: Date.now(),
            lastError: null,
          });
        } catch (e) {
          console.error("store err", e.message);
        }
      } else if (packet.type === "miner_offline") {
        const cid = String(packet.clientId || clientId);
        const out = { type: "miner_offline", clientId: cid, ts: Date.now() };
        lastMiner.set(cid, out);
        broadcast(cid, out);
      } else if (packet.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    }

    if (ws.role === "browser" && packet.type === "subscribe") {
      const cid = String(packet.clientId || clientId);
      ws.clientId = cid;
      if (!watchers.has(cid)) watchers.set(cid, new Set());
      watchers.get(cid).add(ws);
      const last = lastMiner.get(cid);
      if (last) ws.send(JSON.stringify(last));
    }
  });

  ws.on("close", () => {
    if (ws.role === "bridge") bridges.delete(ws);
    const set = watchers.get(ws.clientId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) watchers.delete(ws.clientId);
    }
  });
});

// REST snapshot still available via Next routes using same store file

server.listen(port, hostname, () => {
  console.log(`> SoloPulse ready on http://${hostname}:${port}`);
  console.log(`> WebSocket wss://…/ws  (roles: bridge|browser)`);
});
