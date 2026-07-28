import type { AgentHeartbeat, AgentSnapshot, MinerTelemetry } from "./telemetry";
import { toClientId } from "./clientId";

/**
 * Multi-tenant agent snapshot store (keyed by clientId = payout address).
 * Sticky freshness so dashboards do not flap OFFLINE.
 */

const DEFAULT_SNAPSHOT =
  "https://jsonblob.com/api/jsonBlob/019fa850-df81-7bea-af1b-2c18bc6361a8";

const FRESH_MS = 120_000;

function snapshotUrl(): string {
  return (
    process.env.AGENT_SNAPSHOT_URL ||
    process.env.SOLOPULSE_SNAPSHOT_URL ||
    DEFAULT_SNAPSHOT
  ).trim();
}

type Slot = {
  telemetry: MinerTelemetry | null;
  heartbeat: AgentHeartbeat | null;
  updatedAt: number;
};

type StoreShape = {
  version: 2;
  clients: Record<string, Slot>;
  /** legacy single-slot fallback */
  telemetry?: MinerTelemetry | null;
  heartbeat?: AgentHeartbeat | null;
  updatedAt?: number;
};

let mem: StoreShape = { version: 2, clients: {} };
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

function emptySlot(): Slot {
  return { telemetry: null, heartbeat: null, updatedAt: 0 };
}

function ensureClients(data: StoreShape): Record<string, Slot> {
  if (data.clients && typeof data.clients === "object") return data.clients;
  // migrate legacy single snapshot → default
  const clients: Record<string, Slot> = {};
  if (data.telemetry || data.heartbeat) {
    clients.default = {
      telemetry: data.telemetry || null,
      heartbeat: data.heartbeat || null,
      updatedAt: Number(data.updatedAt) || 0,
    };
  }
  return clients;
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
      version: 2,
      clients: ensureClients(j),
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

function slotOf(id: string): Slot {
  const cid = toClientId(id);
  if (!mem.clients[cid]) mem.clients[cid] = emptySlot();
  return mem.clients[cid];
}

function buildSnapshot(slot: Slot): AgentSnapshot {
  const now = Date.now();
  const t = slot.telemetry;
  const hb = slot.heartbeat;
  const last = Math.max(t?.collectedAt || 0, hb?.ts || 0, slot.updatedAt || 0);
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

export async function putTelemetry(
  t: MinerTelemetry,
  clientId: string = "default"
) {
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
    slot.telemetry = t;
    slot.heartbeat = {
      agentId: String(t.agentId || slot.heartbeat?.agentId || "local-agent"),
      status: t.agentStatus || "STREAMING",
      version: slot.heartbeat?.version || "1",
      devices: [String(t.hostIp || "")].filter(Boolean),
      ts: now,
      lastError: null,
    };
    slot.updatedAt = now;
    await remotePut(mem);
  });
}

export async function putHeartbeat(
  h: AgentHeartbeat,
  clientId: string = "default"
) {
  const cid = toClientId(clientId);
  return enqueueWrite(async () => {
    const remote = await remoteGet();
    if (remote) {
      mem = {
        version: 2,
        clients: { ...ensureClients(remote), ...mem.clients },
      };
    }
    const slot = slotOf(cid);
    slot.heartbeat = h;
    slot.updatedAt = Date.now();
    await remotePut(mem);
  });
}

export async function getSnapshot(
  clientId: string = "default"
): Promise<AgentSnapshot> {
  const cid = toClientId(clientId);
  const remote = await remoteGet();
  if (remote) {
    mem = {
      version: 2,
      clients: { ...mem.clients, ...ensureClients(remote) },
    };
  }
  // fallback: if this client empty but legacy default has data and cid is default
  let slot = mem.clients[cid] || emptySlot();
  if (!slot.telemetry && cid !== "default" && mem.clients.default?.telemetry) {
    // no cross-user leak — only default may use default
  }
  if (!slot.telemetry && !slot.heartbeat && cid === "default") {
    slot = mem.clients.default || slot;
  }
  return buildSnapshot(slot);
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
