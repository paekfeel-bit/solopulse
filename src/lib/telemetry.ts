/** Shared miner telemetry contract (Agent → Cloud → Dashboard) */

export type AgentStatus =
  | "STARTING"
  | "DISCOVERING"
  | "DEVICE_FOUND"
  | "CONNECTING"
  | "CONNECTED"
  | "STREAMING"
  | "LAST_KNOWN"
  | "RECONNECTING"
  | "DEVICE_OFFLINE"
  | "AGENT_OFFLINE"
  | "ERROR";

export type MinerTelemetry = {
  schemaVersion: 1;
  deviceId: string;
  deviceModel: string;
  hostIp: string;
  hashRateGhs: number;
  hashRateHs: number;
  windows: {
    instantGhs: number;
    m1Ghs: number;
    m10Ghs: number;
    h1Ghs: number;
    d1Ghs: number;
  };
  tempC: number | null;
  powerW: number | null;
  fanRpm: number | null;
  bestDiff: number;
  bestSessionDiff: number;
  networkDifficulty: number;
  sharesAccepted: number;
  sharesRejected: number;
  foundBlocks: number;
  totalFoundBlocks: number;
  uptimeSec: number | null;
  firmware: string | null;
  collectedAt: number;
  agentId: string;
  agentStatus: AgentStatus;
  source: "axeos" | "adapter" | "unknown";
};

export type AgentHeartbeat = {
  agentId: string;
  status: AgentStatus;
  hostname?: string;
  platform?: string;
  version: string;
  devices: string[];
  ts: number;
  lastError?: string | null;
};

export type AgentSnapshot = {
  online: boolean;
  agentOnline: boolean;
  agentStatus: AgentStatus;
  telemetry: MinerTelemetry | null;
  heartbeat: AgentHeartbeat | null;
  updatedAt: number;
  staleMs: number;
};

export function emptyWindows() {
  return { instantGhs: 0, m1Ghs: 0, m10Ghs: 0, h1Ghs: 0, d1Ghs: 0 };
}
