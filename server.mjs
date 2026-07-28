/**
 * SoloPulse production server (Railway)
 * Next.js HTTP + WebSocket /ws for Local Bridge
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { putStream } from "./server-agent-store.mjs";

const require = createRequire(import.meta.url);
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const AGENT_KEY =
  process.env.SOLOPULSE_AGENT_KEY ||
  process.env.AGENT_KEY ||
  "solopulse-local-dev-key";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const watchers = new Map();
const lastMiner = new Map();
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
  const ghsRaw = Number(data.hashrate ?? data.hashRateGhs ?? data.hashRate) || 0;
  const ghs = ghsRaw >= 1e11 ? ghsRaw / 1e9 : ghsRaw;
  return {
    schemaVersion: 1,
    deviceId: String(data.deviceId || data.hostIp || clientId),
    deviceModel: String(data.deviceModel || data.model || "NerdQAxe"),
    hostIp: String(data.hostIp || data.ip || ""),
    hashRateGhs: ghs,
    hashRateHs: ghs * 1e9,
    windows: {
      instantGhs: ghs,
      m1Ghs: Number(data.hashrate1m || ghs) || ghs,
      m10Ghs: Number(data.hashrate10m || ghs) || ghs,
      h1Ghs: Number(data.hashrate1h || ghs) || ghs,
      d1Ghs: Number(data.hashrate1d || ghs) || ghs,
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

app
  .prepare()
  .then(() => {
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
      let url;
      try {
        url = new URL(
          req.url || "/ws",
          `http://${req.headers.host || "localhost"}`
        );
      } catch {
        ws.close();
        return;
      }
      const role = url.searchParams.get("role") || "browser";
      const clientId = url.searchParams.get("clientId") || "default";
      const key = url.searchParams.get("key") || "";

      ws.role = role;
      ws.clientId = clientId;

      if (role === "bridge") {
        if (!verifyKey(key)) {
          try {
            ws.send(JSON.stringify({ type: "error", error: "unauthorized" }));
          } catch {
            /* */
          }
          ws.close();
          return;
        }
        bridges.add(ws);
        console.log("[ws] bridge connected", clientId);
        try {
          ws.send(JSON.stringify({ type: "hello", role: "bridge", ok: true }));
        } catch {
          /* */
        }
      } else {
        if (!watchers.has(clientId)) watchers.set(clientId, new Set());
        watchers.get(clientId).add(ws);
        console.log("[ws] browser watch", clientId);
        const last = lastMiner.get(clientId);
        try {
          if (last) ws.send(JSON.stringify(last));
          ws.send(
            JSON.stringify({
              type: "hello",
              role: "browser",
              ok: true,
              hasBridge: bridges.size > 0,
            })
          );
        } catch {
          /* */
        }
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
            // Fan-out to matching clientId + "default" so UI always receives
            broadcast(cid, out);
            if (cid !== "default") broadcast("default", out);
            try {
              const tel = telFromBridge(cid, {
                ...data,
                agentId: packet.agentId,
              });
              // Always stamp collectedAt so sticky online works
              if (!tel.collectedAt || tel.collectedAt < Date.now() - 5_000) {
                tel.collectedAt = Date.now();
              }
              await putStream(tel, {
                agentId: String(packet.agentId || "ws-bridge"),
                status: "STREAMING",
                version: "ws-1",
                devices: [String(data.hostIp || data.ip || "")].filter(Boolean),
                ts: Date.now(),
                lastError: null,
              });
            } catch (e) {
              console.error("store err", e.message || e);
            }
          } else if (packet.type === "miner_offline") {
            const cid = String(packet.clientId || clientId);
            const out = {
              type: "miner_offline",
              clientId: cid,
              ts: Date.now(),
            };
            lastMiner.set(cid, out);
            broadcast(cid, out);
          } else if (packet.type === "ping") {
            try {
              ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
            } catch {
              /* */
            }
          }
        }

        if (ws.role === "browser" && packet.type === "subscribe") {
          const cid = String(packet.clientId || clientId);
          ws.clientId = cid;
          if (!watchers.has(cid)) watchers.set(cid, new Set());
          watchers.get(cid).add(ws);
          const last = lastMiner.get(cid);
          if (last) {
            try {
              ws.send(JSON.stringify(last));
            } catch {
              /* */
            }
          }
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

    server.listen(port, hostname, () => {
      console.log(`> SoloPulse http://${hostname}:${port}`);
      console.log(`> WebSocket /ws (bridge|browser)`);
    });
  })
  .catch((err) => {
    console.error("Failed to start", err);
    process.exit(1);
  });
