import type { HashrateSample } from "./types";

const KEY_PREFIX = "solopulse:hr:";
const MAX_SAMPLES = 480;

const ADDR_KEY = "solopulse:address";
const LAST_ADDR_KEY = "solopulse:lastAddress";
const POOL_KEY = "solopulse:pool";
const DEVICE_IP_KEY = "solopulse:deviceIp";
/** DHCP changes often — scan will override; keep last known NerdQAxe */
const DEFAULT_DEVICE_IP = "172.30.1.99";

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* */
  }
}

function lsDel(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* */
  }
}

export function loadHistory(address: string): HashrateSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_PREFIX + address);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HashrateSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(address: string, samples: HashrateSample[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY_PREFIX + address,
      JSON.stringify(samples.slice(-MAX_SAMPLES))
    );
  } catch {
    /* */
  }
}

export function pushSample(
  address: string,
  ghs: number,
  existing?: HashrateSample[]
): HashrateSample[] {
  if (!address || !Number.isFinite(ghs) || ghs < 0) {
    return existing ?? loadHistory(address);
  }
  const prev = existing ?? loadHistory(address);
  const now = Date.now();
  if (prev.length && now - prev[prev.length - 1].t < 1_000) {
    const next = [...prev];
    next[next.length - 1] = { t: now, ghs };
    saveHistory(address, next);
    return next;
  }
  const next = [...prev, { t: now, ghs }].slice(-MAX_SAMPLES);
  saveHistory(address, next);
  return next;
}

export function getStoredAddress(): string | null {
  const v = lsGet(ADDR_KEY);
  return v && v.trim() ? v.trim() : null;
}

export function setStoredAddress(address: string) {
  const a = address.trim();
  if (!a) return;
  lsSet(ADDR_KEY, a);
  lsSet(LAST_ADDR_KEY, a);
}

export function clearStoredAddress() {
  const cur = lsGet(ADDR_KEY);
  if (cur && cur.trim()) lsSet(LAST_ADDR_KEY, cur.trim());
  lsDel(ADDR_KEY);
}

export function getLastAddress(): string {
  const last = lsGet(LAST_ADDR_KEY);
  if (last && last.trim()) return last.trim();
  const cur = lsGet(ADDR_KEY);
  if (cur && cur.trim()) return cur.trim();
  return "";
}

export function rememberLastAddress(address: string) {
  const a = address.trim();
  if (a) lsSet(LAST_ADDR_KEY, a);
}

export function getStoredPool(): string {
  return lsGet(POOL_KEY) || "solo.ckpool.org";
}

export function setStoredPool(pool: string) {
  lsSet(POOL_KEY, pool);
}

export function normalizeDeviceHost(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return `${u.protocol}//${u.host}`;
    } catch {
      s = s.replace(/^https?:\/\//i, "").split("/")[0];
      return s;
    }
  }
  return s.split("/")[0].split("?")[0].split("#")[0].trim();
}

export function isValidDeviceHost(host: string): boolean {
  const h = normalizeDeviceHost(host);
  if (!h) return false;
  let hostname = h;
  if (/^https?:\/\//i.test(h)) {
    try {
      hostname = new URL(h).hostname;
    } catch {
      return false;
    }
  } else {
    hostname = h.replace(/:\d+$/, "");
  }
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1") return true;
  if (lower.endsWith(".local")) return true;
  if (
    lower.endsWith(".trycloudflare.com") ||
    lower.endsWith(".loca.lt") ||
    lower.endsWith(".ngrok-free.app") ||
    lower.endsWith(".ngrok.io") ||
    lower.endsWith(".cfargotunnel.com")
  ) {
    return true;
  }
  if (lower.startsWith("169.254.")) return false;
  const m = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  return false;
}

export function getStoredDeviceIp(): string {
  if (typeof window === "undefined") return DEFAULT_DEVICE_IP;
  const v = lsGet(DEVICE_IP_KEY);
  if (v === null) return DEFAULT_DEVICE_IP;
  return normalizeDeviceHost(v);
}

export function setStoredDeviceIp(ip: string) {
  lsSet(DEVICE_IP_KEY, normalizeDeviceHost(ip));
}

export function clearStoredDeviceIp() {
  lsDel(DEVICE_IP_KEY);
}
