/**
 * Shared agent snapshot for custom server (WebSocket path).
 * Atomic telemetry+heartbeat writes to avoid JSONBlob races.
 */
const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";

/** Device considered live this long after last sample (sticky) */
const FRESH_MS = 120_000;

function snapshotUrl() {
  return (
    process.env.AGENT_SNAPSHOT_URL ||
    process.env.SOLOPULSE_SNAPSHOT_URL ||
    DEFAULT_SNAPSHOT
  ).trim();
}

let mem = { telemetry: null, heartbeat: null, updatedAt: 0 };
let writeChain = Promise.resolve();

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
    return {
      telemetry: j.telemetry || null,
      heartbeat: j.heartbeat || null,
      updatedAt: Number(j.updatedAt) || 0,
    };
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

/** Serialize all writes so concurrent bridge ticks cannot clobber each other */
function enqueueWrite(fn) {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

export async function putTelemetry(t) {
  return enqueueWrite(async () => {
    const now = Date.now();
    const remote = await remoteGet();
    if (remote && (remote.updatedAt || 0) > (mem.updatedAt || 0)) {
      mem = {
        telemetry: remote.telemetry || mem.telemetry,
        heartbeat: remote.heartbeat || mem.heartbeat,
        updatedAt: remote.updatedAt,
      };
    }
    mem.telemetry = t;
    mem.heartbeat = {
      agentId: String(t.agentId || mem.heartbeat?.agentId || "ws-bridge"),
      status: t.agentStatus || "STREAMING",
      version: mem.heartbeat?.version || "ws-1",
      devices: [String(t.hostIp || "")].filter(Boolean),
      ts: now,
      lastError: null,
    };
    mem.updatedAt = now;
    await remotePut(mem);
  });
}

export async function putHeartbeat(h) {
  return enqueueWrite(async () => {
    const remote = await remoteGet();
    if (remote) {
      mem = {
        telemetry: remote.telemetry || mem.telemetry,
        heartbeat: h,
        updatedAt: Date.now(),
      };
    } else {
      mem.heartbeat = h;
      mem.updatedAt = Date.now();
    }
    await remotePut(mem);
  });
}

/** One-shot write used by WebSocket path — no second race with putHeartbeat */
export async function putStream(t, h) {
  return enqueueWrite(async () => {
    const now = Date.now();
    const remote = await remoteGet();
    if (remote && (remote.updatedAt || 0) > (mem.updatedAt || 0)) {
      mem = {
        telemetry: remote.telemetry || mem.telemetry,
        heartbeat: remote.heartbeat || mem.heartbeat,
        updatedAt: remote.updatedAt,
      };
    }
    mem.telemetry = t || mem.telemetry;
    mem.heartbeat = h || mem.heartbeat;
    mem.updatedAt = now;
    await remotePut(mem);
  });
}

export async function getSnapshot() {
  const remote = await remoteGet();
  if (remote && (remote.updatedAt || 0) >= (mem.updatedAt || 0)) mem = remote;
  const now = Date.now();
  const t = mem.telemetry;
  const hb = mem.heartbeat;
  const last = Math.max(t?.collectedAt || 0, hb?.ts || 0, mem.updatedAt || 0);
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
