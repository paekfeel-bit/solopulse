import type { AgentHeartbeat, AgentSnapshot, MinerTelemetry } from "./telemetry";

/**
 * Shared agent snapshot store.
 * Atomic writes + sticky freshness so dashboard does not flap OFFLINE.
 */

const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";

/** Live window after last sample (2 min sticky) */
const FRESH_MS = 120_000;

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
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

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

async function remotePut(data: StoreShape): Promise<boolean> {
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

export async function putTelemetry(t: MinerTelemetry) {
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
      agentId: String(t.agentId || mem.heartbeat?.agentId || "local-agent"),
      status: t.agentStatus || "STREAMING",
      version: mem.heartbeat?.version || "1",
      devices: [String(t.hostIp || "")].filter(Boolean),
      ts: now,
      lastError: null,
    };
    mem.updatedAt = now;
    await remotePut(mem);
  });
}

export async function putHeartbeat(h: AgentHeartbeat) {
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
  const deviceFresh = Boolean(t && now - t.collectedAt < FRESH_MS);
  const agentOnline = Boolean(hb && now - hb.ts < FRESH_MS) || deviceFresh;
  const ghs = Number(t?.hashRateGhs) || 0;
  const live = deviceFresh && ghs > 0;
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
