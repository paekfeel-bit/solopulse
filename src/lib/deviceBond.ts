/**
 * Persistent board link memory.
 * Once the user successfully links a device, we remember IPs + identity
 * and auto-reconnect (including after DHCP IP changes).
 */

import { isPrivateIPv4 } from "@/lib/deviceClient";
import { normalizeDeviceHost } from "@/lib/history";

const BOND_KEY = "solopulse:deviceBond:v1";
const MAX_IP_HISTORY = 12;

export type DeviceBond = {
  /** True after at least one successful board link */
  linked: boolean;
  /** Keep trying forever when true (default once linked) */
  autoReconnect: boolean;
  lastIp: string;
  /** Recent IPs (newest first) — DHCP may rotate */
  ipHistory: string[];
  deviceModel: string;
  hostname: string;
  lastSeenAt: number;
  lastGhs: number;
  lastTemp: number | null;
  clientId: string;
};

function emptyBond(): DeviceBond {
  return {
    linked: false,
    autoReconnect: false,
    lastIp: "",
    ipHistory: [],
    deviceModel: "",
    hostname: "",
    lastSeenAt: 0,
    lastGhs: 0,
    lastTemp: null,
    clientId: "default",
  };
}

export function loadDeviceBond(): DeviceBond {
  if (typeof window === "undefined") return emptyBond();
  try {
    const raw = localStorage.getItem(BOND_KEY);
    if (!raw) return emptyBond();
    const j = JSON.parse(raw) as Partial<DeviceBond>;
    return {
      ...emptyBond(),
      ...j,
      ipHistory: Array.isArray(j.ipHistory)
        ? j.ipHistory.map(String).filter(Boolean)
        : [],
      linked: Boolean(j.linked),
      autoReconnect: j.autoReconnect !== false && Boolean(j.linked),
    };
  } catch {
    return emptyBond();
  }
}

export function saveDeviceBond(bond: DeviceBond): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOND_KEY, JSON.stringify(bond));
  } catch {
    /* */
  }
}

function pushIpHistory(history: string[], ip: string): string[] {
  const clean = normalizeDeviceHost(ip) || ip.trim();
  if (!clean || clean === "auto") return history;
  const next = [clean, ...history.filter((x) => x !== clean)];
  return next.slice(0, MAX_IP_HISTORY);
}

/** Call on every successful board read */
export function rememberDeviceLink(opts: {
  ip: string;
  deviceModel?: string;
  hostname?: string;
  hashRateGhs?: number;
  temp?: number | null;
  clientId?: string;
}): DeviceBond {
  const prev = loadDeviceBond();
  const ip = normalizeDeviceHost(opts.ip) || opts.ip.trim();
  const bond: DeviceBond = {
    linked: true,
    autoReconnect: true,
    lastIp: ip || prev.lastIp,
    ipHistory: ip ? pushIpHistory(prev.ipHistory, ip) : prev.ipHistory,
    deviceModel: opts.deviceModel || prev.deviceModel || "",
    hostname: opts.hostname || prev.hostname || "",
    lastSeenAt: Date.now(),
    lastGhs: Number(opts.hashRateGhs) || prev.lastGhs || 0,
    lastTemp:
      opts.temp != null && Number.isFinite(Number(opts.temp))
        ? Number(opts.temp)
        : prev.lastTemp,
    clientId: opts.clientId || prev.clientId || "default",
  };
  saveDeviceBond(bond);
  return bond;
}

export function setDeviceBondAutoReconnect(on: boolean): DeviceBond {
  const b = loadDeviceBond();
  b.autoReconnect = on;
  if (on) b.linked = true;
  saveDeviceBond(b);
  return b;
}

export function clearDeviceBond(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOND_KEY);
  } catch {
    /* */
  }
}

/**
 * Candidates when IP may have changed (DHCP).
 * Order: last IP → history → same-subnet neighbors → common home ranges.
 */
export function bondReconnectCandidates(bond?: DeviceBond | null): string[] {
  const b = bond || loadDeviceBond();
  const out: string[] = [];
  const add = (ip: string) => {
    const v = normalizeDeviceHost(ip) || ip.trim();
    if (!v || v === "auto") return;
    if (!out.includes(v)) out.push(v);
  };

  add(b.lastIp);
  for (const ip of b.ipHistory) add(ip);

  // Same /24 neighbors around last octet (DHCP often moves ± a few)
  const base = b.lastIp || b.ipHistory[0] || "";
  const host = base.replace(/:\d+$/, "").replace(/^https?:\/\//i, "");
  if (isPrivateIPv4(host)) {
    const parts = host.split(".").map(Number);
    const [a, b2, c, d] = parts;
    const prefer = [
      d,
      d + 1,
      d - 1,
      d + 2,
      d - 2,
      d + 3,
      d - 3,
      33,
      70,
      56,
      50,
      100,
      1,
      254,
    ];
    for (const oct of prefer) {
      if (oct >= 1 && oct <= 254) add(`${a}.${b2}.${c}.${oct}`);
    }
  }

  // Known Korean home / lab ranges used in this product
  for (const ip of ["172.30.1.33", "172.30.1.70", "172.30.1.56", "192.168.1.45"]) {
    add(ip);
  }

  return out;
}
