/**
 * Shared AxeOS / Bitaxe / NerdQAxe device parsing + multi-path fetch.
 * Used by both browser (direct LAN) and /api/device (server proxy).
 */

export type DeviceInfo = {
  online: boolean;
  live: boolean;
  ip: string;
  deviceModel: string;
  hashRateGhs: number;
  hashRateHs: number;
  windows: {
    instantGhs: number;
    m1Ghs: number;
    m10Ghs: number;
    h1Ghs: number;
    d1Ghs: number;
  };
  temp: number | null;
  power: number | null;
  bestDiff: number;
  bestSessionDiff: number;
  networkDifficulty: number;
  foundBlocks: number;
  totalFoundBlocks: number;
  sharesAccepted: number;
  sharesRejected: number;
  fetchedAt: number;
  error?: string;
  via?: "direct" | "proxy";
};

function toGhs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1e11) return n / 1e9;
  return n;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function firstNumber(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 169 && b === 254) return false;
  if (a === 0 || a === 255) return false;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * SSRF guard for /api/device.
 * Allow only home LAN, localhost, .local, and known tunnel host suffixes.
 */
export function isAllowedDeviceHost(hostOnly: string): boolean {
  const h = hostOnly.toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") {
    return true;
  }
  if (h === "169.254.169.254" || h.startsWith("169.254.")) return false;
  if (h === "metadata.google.internal") return false;

  if (h.endsWith(".local")) return true;
  const tunnelSuffixes = [
    ".trycloudflare.com",
    ".loca.lt",
    ".localtunnel.me",
    ".ngrok.io",
    ".ngrok-free.app",
    ".ngrok-free.dev",
    ".pinggy.io",
    ".cfargotunnel.com",
  ];
  if (tunnelSuffixes.some((s) => h.endsWith(s))) return true;

  if (isPrivateIPv4(h)) return true;
  return false;
}

export function parseDeviceTarget(raw: string): {
  base: string;
  displayHost: string;
  privateLan: boolean;
  hostOnly: string;
} | null {
  let s = raw.trim();
  if (!s) return null;
  let protocol = "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      protocol = u.protocol.replace(":", "");
      s = u.host;
    } catch {
      s = s.replace(/^https?:\/\//i, "").split("/")[0];
    }
  } else {
    s = s.split("/")[0].split("?")[0].split("#")[0].trim();
  }
  if (!s || s.includes("://")) return null;
  if (!/^[\d.a-zA-Z0-9_-]+(\.[\d.a-zA-Z0-9_-]+)*(:\d{1,5})?$/.test(s)) {
    return null;
  }
  const hostOnly = s.replace(/:\d+$/, "");
  if (!isAllowedDeviceHost(hostOnly)) {
    return null;
  }
  const privateLan = isPrivateIPv4(hostOnly) || hostOnly.endsWith(".local");
  const scheme = protocol || (privateLan ? "http" : "https");
  const finalScheme =
    privateLan || hostOnly === "localhost" || hostOnly === "127.0.0.1"
      ? scheme || "http"
      : "https";
  return {
    base: `${finalScheme}://${s}`,
    displayHost: s,
    privateLan,
    hostOnly,
  };
}

export function parseAxeOsPayload(
  raw: Record<string, unknown>,
  displayHost: string,
  via: "direct" | "proxy"
): DeviceInfo {
  const rawInstant = firstNumber(
    raw.hashRate,
    raw.hashrate,
    raw.hash_rate,
    raw.HashRate,
    raw.hashRateCurrent,
    raw.currentHashrate,
    raw.hashRate_1m,
    raw.hashrate_1m
  );
  const ghs = toGhs(rawInstant);
  const ghs1m =
    toGhs(firstNumber(raw.hashRate_1m, raw.hashrate_1m, rawInstant)) || ghs;
  const ghs10m =
    toGhs(firstNumber(raw.hashRate_10m, raw.hashrate_10m, raw.hashRate_5m)) ||
    ghs;
  const ghs1h =
    toGhs(firstNumber(raw.hashRate_1h, raw.hashrate_1h, raw.hashRate_1hr)) ||
    ghs;
  const ghs1d = toGhs(firstNumber(raw.hashRate_1d, raw.hashrate_1d)) || ghs;
  const displayGhs = ghs > 0 ? ghs : ghs1m;

  const tempVal = firstNumber(
    raw.temp,
    raw.temperature,
    raw.temp_board,
    raw.tempBoard,
    raw.asic_temp,
    raw.asicTemp,
    raw.vrTemp
  );

  return {
    online: true,
    live: true,
    ip: displayHost,
    deviceModel: String(
      raw.deviceModel ||
        raw.ASICModel ||
        raw.hostname ||
        raw.boardVersion ||
        "AxeOS miner"
    ),
    hashRateGhs: displayGhs,
    hashRateHs: displayGhs * 1e9,
    windows: {
      instantGhs: displayGhs,
      m1Ghs: ghs1m,
      m10Ghs: ghs10m,
      h1Ghs: ghs1h,
      d1Ghs: ghs1d,
    },
    temp: tempVal > 0 ? tempVal : null,
    power: (() => {
      const p = num(raw.power, NaN);
      return Number.isFinite(p) ? p : null;
    })(),
    bestDiff: num(raw.bestDiff) || num(raw.bestSessionDiff),
    bestSessionDiff: num(raw.bestSessionDiff) || num(raw.bestDiff),
    networkDifficulty: num(raw.networkDifficulty),
    foundBlocks: num(raw.foundBlocks),
    totalFoundBlocks: num(raw.totalFoundBlocks),
    sharesAccepted: num(raw.sharesAccepted),
    sharesRejected: num(raw.sharesRejected),
    fetchedAt: Date.now(),
    via,
  };
}

const PATHS = [
  "/api/system/info",
  "/api/system/status",
  "/api/system/asic",
  "/api/system",
];

function parseJsonLoose(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Browser or server: hit miner base URL directly */
export async function fetchDeviceDirect(
  rawHost: string,
  timeoutMs = 6000
): Promise<{ ok: true; info: DeviceInfo } | { ok: false; error: string }> {
  const target = parseDeviceTarget(rawHost);
  if (!target) return { ok: false, error: "Invalid device host" };

  let lastErr = "device unreachable";
  for (const path of PATHS) {
    const url = `${target.base}${path}`;
    try {
      const init: RequestInit = {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: "application/json, text/plain, */*",
          // Some AxeOS builds are picky about User-Agent
          "User-Agent": "SoloPulse/1.0",
        },
        redirect: "follow",
      };
      // mode:cors only valid/needed in browsers; omit on Node (Vercel)
      if (typeof window !== "undefined") {
        init.mode = "cors";
      }
      const res = await fetch(url, init);
      if (!res.ok) {
        lastErr = `HTTP ${res.status} @ ${path}`;
        continue;
      }
      const text = await res.text();
      const raw = parseJsonLoose(text);
      if (!raw) {
        lastErr = `Invalid JSON @ ${path}`;
        continue;
      }
      const info = parseAxeOsPayload(raw, target.displayHost, "direct");
      return { ok: true, info };
    } catch (e) {
      const m = e instanceof Error ? e.message : "fetch failed";
      // Node undici timeout wording
      if (/timeout|aborted|AbortError/i.test(m)) {
        lastErr = `timeout @ ${path}`;
      } else {
        lastErr = m;
      }
    }
  }
  return { ok: false, error: lastErr };
}

/**
 * Can the browser call the miner without mixed-content block?
 * HTTPS page → HTTP LAN IP is blocked by browsers.
 */
export function canBrowserReachDevice(rawHost: string): boolean {
  if (typeof window === "undefined") return false;
  const target = parseDeviceTarget(rawHost);
  if (!target) return false;
  if (target.base.startsWith("https://")) return true;
  if (window.location.protocol === "https:") return false;
  return true;
}

/** Running on public cloud host (Vercel/Netlify) — no home LAN access */
export function isCloudHostedPage(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return (
    h.endsWith(".vercel.app") ||
    h.endsWith(".netlify.app") ||
    h.endsWith(".netlify.com") ||
    h.includes("vercel") ||
    h.includes("netlify")
  );
}

/** Guess subnet candidates for scan UI */
export function guessScanCandidates(baseHint?: string): string[] {
  const ips: string[] = [];
  const addRange = (a: number, b: number, c: number) => {
    for (const d of [
      1, 2, 10, 20, 30, 40, 50, 60, 66, 67, 70, 74, 80, 90, 96, 97, 99, 100, 110,
      120, 150, 200, 254,
    ]) {
      ips.push(`${a}.${b}.${c}.${d}`);
    }
  };

  if (baseHint) {
    const t = parseDeviceTarget(baseHint);
    if (t && isPrivateIPv4(t.hostOnly)) {
      const [a, b, c] = t.hostOnly.split(".").map(Number);
      addRange(a, b, c);
    }
  }

  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (isPrivateIPv4(h)) {
      const [a, b, c] = h.split(".").map(Number);
      addRange(a, b, c);
    }
  }

  addRange(172, 30, 1);
  addRange(192, 168, 0);
  addRange(192, 168, 1);

  return [...new Set(ips)];
}
