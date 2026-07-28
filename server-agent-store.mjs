/**
 * Multi-tenant agent snapshot for custom server (WebSocket path).
 * Keyed by clientId (= payout address). Mirrors src/lib/agentStore.ts
 */
const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";
const FRESH_MS = 120_000;

function snapshotUrl() {
  return (
    process.env.AGENT_SNAPSHOT_URL ||
    process.env.SOLOPULSE_SNAPSHOT_URL ||
    DEFAULT_SNAPSHOT
  ).trim();
}

function toClientId(id) {
  return String(id || "default").trim().replace(/\s+/g, "") || "default";
}

let mem = { version: 2, clients: {} };
let writeChain = Promise.resolve();

function enqueueWrite(fn) {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

function emptySlot() {
  return { telemetry: null, heartbeat: null, updatedAt: 0 };
}

function ensureClients(data) {
  if (data?.clients && typeof data.clients === "object") return data.clients;
  const clients = {};
  if (data?.telemetry || data?.heartbeat) {
    clients.default = {
      telemetry: data.telemetry || null,
      heartbeat: data.heartbeat || null,
      updatedAt: Number(data.updatedAt) || 0,
    };
  }
  return clients;
}

async function remoteGet() {
  try {
    const res = await fetch(snapshotUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || typeof j !== "object") return null;
    return { version: 2, clients: ensureClients(j) };
  } catch {
    return null;
  }
}

async function remotePut(data) {
  try {
    const res = await fetch(snapshotUrl(), {
      method: "PUT",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function slotOf(cid) {
  if (!mem.clients[cid]) mem.clients[cid] = emptySlot();
  return mem.clients[cid];
}

export async function putStream(t, h, clientId = "default") {
  const cid = toClientId(clientId);
  return enqueueWrite(async () => {
    const now = Date.now();
    const remote = await remoteGet();
    if (remote) {
      mem = {
        version: 2,
        clients: { ...ensureClients(remote), ...mem.clients },
      };
    }
    const slot = slotOf(cid);
    if (t) slot.telemetry = t;
    if (h) slot.heartbeat = h;
    slot.updatedAt = now;
    await remotePut(mem);
  });
}

export async function getSnapshot(clientId = "default") {
  const cid = toClientId(clientId);
  const remote = await remoteGet();
  if (remote) {
    mem = {
      version: 2,
      clients: { ...mem.clients, ...ensureClients(remote) },
    };
  }
  const slot = mem.clients[cid] || emptySlot();
  const now = Date.now();
  const t = slot.telemetry;
  const hb = slot.heartbeat;
  const last = Math.max(t?.collectedAt || 0, hb?.ts || 0, slot.updatedAt || 0);
  const deviceFresh = Boolean(t && now - t.collectedAt < FRESH_MS);
  const agentOnline = Boolean(hb && now - hb.ts < FRESH_MS) || deviceFresh;
  const ghs = Number(t?.hashRateGhs) || 0;
  return {
    online: deviceFresh && ghs > 0,
    agentOnline,
    agentStatus: hb?.status || (deviceFresh ? "STREAMING" : "AGENT_OFFLINE"),
    telemetry: t,
    heartbeat: hb,
    updatedAt: last || 0,
    staleMs: last ? now - last : 999_999_999,
  };
}
