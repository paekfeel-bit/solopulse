import type { AgentHeartbeat, AgentSnapshot, MinerTelemetry } from "./telemetry";

/**
 * Shared agent snapshot store.
 * Vercel serverless has no durable local FS across instances —
 * use JSONBlob (or set AGENT_SNAPSHOT_URL) as source of truth in production.
 */

const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";

function snapshotUrl(): string {
  return (
    process.env.AGENT_SNAPSHOT_URL ||
    process.env.SOLOPULSE_SNAPSHOT_URL ||
    DEFAULT_SNAPSHOT
  ).trim();
}

type StoreShape = {
  telemetry: MinerTelemetry | null;
  heartbeat: AgentHeartbeat | null;
  updatedAt: number;
};

let mem: StoreShape = { telemetry: null, heartbeat: null, updatedAt: 0 };

async function remoteGet(): Promise<StoreShape | null> {
  try {
    const res = await fetch(snapshotUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as StoreShape;
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

async function remotePut(data: StoreShape): Promise<void> {
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
    /* keep memory */
  }
}

export async function putTelemetry(t: MinerTelemetry) {
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

export async function putHeartbeat(h: AgentHeartbeat) {
  // merge with remote first so we don't wipe telemetry from another instance
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

export async function getSnapshot(): Promise<AgentSnapshot> {
  const remote = await remoteGet();
  if (remote && (remote.updatedAt || 0) >= (mem.updatedAt || 0)) {
    mem = remote;
  }
  const now = Date.now();
  const t = mem.telemetry;
  const hb = mem.heartbeat;
  const last = Math.max(t?.collectedAt || 0, hb?.ts || 0, mem.updatedAt || 0);
  const staleMs = last ? now - last : Number.POSITIVE_INFINITY;
  const agentOnline = Boolean(hb && now - hb.ts < 45_000);
  const deviceFresh = Boolean(t && now - t.collectedAt < 45_000);
  // Fresh telemetry alone means the board path is live (heartbeat may lag)
  const live = deviceFresh && (Number(t?.hashRateGhs) || 0) >= 0;
  return {
    online: live,
    agentOnline: agentOnline || live,
    agentStatus:
      hb?.status ||
      (live ? "STREAMING" : agentOnline ? "CONNECTED" : "AGENT_OFFLINE"),
    telemetry: t,
    heartbeat: hb,
    updatedAt: last || 0,
    staleMs: Number.isFinite(staleMs) ? staleMs : 999_999_999,
  };
}

export function getExpectedAgentKey(): string {
  return (
    process.env.SOLOPULSE_AGENT_KEY ||
    process.env.AGENT_KEY ||
    "solopulse-local-dev-key"
  );
}

export function verifyAgentKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return key === getExpectedAgentKey();
}
