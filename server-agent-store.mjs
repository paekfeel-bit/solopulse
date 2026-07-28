/**
 * Shared agent snapshot for custom server (WebSocket path).
 * Mirrors src/lib/agentStore.ts → JSONBlob for multi-instance safety.
 */
const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";

function snapshotUrl() {
  return (
    process.env.AGENT_SNAPSHOT_URL ||
    process.env.SOLOPULSE_SNAPSHOT_URL ||
    DEFAULT_SNAPSHOT
  ).trim();
}

let mem = { telemetry: null, heartbeat: null, updatedAt: 0 };

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
    await fetch(snapshotUrl(), {
      method: "PUT",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch {
    /* */
  }
}

export async function putTelemetry(t) {
  mem.telemetry = t;
  mem.updatedAt = Date.now();
  if (mem.heartbeat) {
    mem.heartbeat = {
      ...mem.heartbeat,
      status: t.agentStatus || mem.heartbeat.status,
      ts: Date.now(),
    };
  }
  await remotePut(mem);
}

export async function putHeartbeat(h) {
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
}

export async function getSnapshot() {
  const remote = await remoteGet();
  if (remote && (remote.updatedAt || 0) >= (mem.updatedAt || 0)) mem = remote;
  const now = Date.now();
  const t = mem.telemetry;
  const hb = mem.heartbeat;
  const last = Math.max(t?.collectedAt || 0, hb?.ts || 0, mem.updatedAt || 0);
  const deviceFresh = Boolean(t && now - t.collectedAt < 45_000);
  const agentOnline = Boolean(hb && now - hb.ts < 45_000) || deviceFresh;
  return {
    online: deviceFresh,
    agentOnline,
    agentStatus: hb?.status || (deviceFresh ? "STREAMING" : "AGENT_OFFLINE"),
    telemetry: t,
    heartbeat: hb,
    updatedAt: last || 0,
    staleMs: last ? now - last : 999_999_999,
  };
}
