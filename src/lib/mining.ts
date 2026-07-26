/**
 * Solo mining math — mirrors the real SHA-256 block-finding mechanism.
 *
 * One hash is a valid block iff hash ≤ network target.
 * P(hash is block) ≈ 1 / (difficulty × 2^32)
 *
 * With hashrate h (H/s), arrivals form a Poisson process with
 * λ(t) = h · t / (difficulty · 2^32)
 * P(≥1 block in time t) = 1 − e^(−λ)
 */

import type { BlockOdds } from "./types";

const TWO_32 = 2 ** 32; // 4_294_967_296

/** Parse ckpool / UI hashrate: "4.57T", "511G", "4.57 TH/s", "4873.8 GH/s" → H/s */
export function parseHashrate(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim().replace(/,/g, "");
  if (!s || s === "0") return 0;

  // Strip common suffixes: H/s, h/s, hashes/s
  s = s.replace(/\s*hashes?\/s\s*$/i, "").replace(/\s*H\/s\s*$/i, "").trim();

  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kKmMgGtTpPeE])?$/);
  if (!m) {
    // e.g. scientific 4.88e12
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toUpperCase();
  const mult: Record<string, number> = {
    "": 1,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  };
  return num * (mult[unit] ?? 1);
}

/** Format H/s into human units (prefer GH/s for small miners). */
export function formatHashrate(hs: number, decimals = 2): string {
  if (!Number.isFinite(hs) || hs <= 0) return "0 H/s";
  const units = [
    { u: "EH/s", d: 1e18 },
    { u: "PH/s", d: 1e15 },
    { u: "TH/s", d: 1e12 },
    { u: "GH/s", d: 1e9 },
    { u: "MH/s", d: 1e6 },
    { u: "KH/s", d: 1e3 },
    { u: "H/s", d: 1 },
  ];
  for (const { u, d } of units) {
    if (hs >= d) return `${(hs / d).toFixed(decimals)} ${u}`;
  }
  return `${hs.toFixed(0)} H/s`;
}

/** Match AxeOS home: always show GH/s with 2 decimals (e.g. 4873.80 GH/s). */
export function formatHashrateGhs(hs: number, decimals = 2): string {
  if (!Number.isFinite(hs) || hs <= 0) return "0.00 GH/s";
  return `${(hs / 1e9).toFixed(decimals)} GH/s`;
}

/** Convert H/s → GH/s for charts. */
export function toGHs(hs: number): number {
  return hs / 1e9;
}

/** Format difficulty / share difficulty (e.g. 559M, 133.9T). */
export function formatDifficulty(d: number, decimals = 2): string {
  if (!Number.isFinite(d) || d <= 0) return "0";
  const abs = Math.abs(d);
  if (abs >= 1e15) return `${(d / 1e15).toFixed(decimals)}P`;
  if (abs >= 1e12) return `${(d / 1e12).toFixed(decimals)}T`;
  if (abs >= 1e9) return `${(d / 1e9).toFixed(decimals)}G`;
  if (abs >= 1e6) return `${(d / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(d / 1e3).toFixed(decimals)}K`;
  return d.toFixed(decimals);
}

/** Expected seconds between blocks for hashrate h at network difficulty. */
export function expectedBlockTimeSeconds(hashrateHs: number, difficulty: number): number {
  if (hashrateHs <= 0 || difficulty <= 0) return Infinity;
  return (difficulty * TWO_32) / hashrateHs;
}

/** Poisson rate λ per second. */
export function blockRatePerSecond(hashrateHs: number, difficulty: number): number {
  if (hashrateHs <= 0 || difficulty <= 0) return 0;
  return hashrateHs / (difficulty * TWO_32);
}

/** P(≥1 block) in `seconds` under Poisson process. */
export function probabilityAtLeastOne(
  hashrateHs: number,
  difficulty: number,
  seconds: number
): number {
  const lambda = blockRatePerSecond(hashrateHs, difficulty) * seconds;
  if (lambda <= 0) return 0;
  if (lambda > 50) return 1; // 1 - e^{-50} ≈ 1
  return 1 - Math.exp(-lambda);
}

const DAY = 86400;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function computeBlockOdds(hashrateHs: number, difficulty: number): BlockOdds {
  const rate = blockRatePerSecond(hashrateHs, difficulty);
  return {
    day: probabilityAtLeastOne(hashrateHs, difficulty, DAY),
    week: probabilityAtLeastOne(hashrateHs, difficulty, WEEK),
    month: probabilityAtLeastOne(hashrateHs, difficulty, MONTH),
    year: probabilityAtLeastOne(hashrateHs, difficulty, YEAR),
    expectedSeconds: expectedBlockTimeSeconds(hashrateHs, difficulty),
    hashesPerBlock: difficulty * TWO_32,
    ratePerSecond: rate,
  };
}

/** Format odds as percentage or scientific "1 in N". */
export function formatOddsPercent(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0%";
  if (p >= 0.9999) return ">99.99%";
  if (p >= 0.01) return `${(p * 100).toFixed(4)}%`;
  if (p >= 0.0001) return `${(p * 100).toFixed(6)}%`;
  if (p >= 1e-10) return `${(p * 100).toFixed(10)}%`;
  // Keep many digits so 0.5s hashrate jitter is visible on screen
  return `${(p * 100).toExponential(6)}%`;
}

export function formatOneIn(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  if (p >= 1) return "1 in 1";
  const n = 1 / p;
  if (n >= 1e12) return `1 in ${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `1 in ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `1 in ${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `1 in ${(n / 1e3).toFixed(2)}K`;
  return `1 in ${Math.round(n).toLocaleString()}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds === Infinity) return "∞";

  const units: [string, number][] = [
    ["y", 365.25 * 86400],
    ["mo", 30.44 * 86400],
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ];

  for (const [label, size] of units) {
    if (seconds >= size) {
      const v = seconds / size;
      return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${label}`;
    }
  }
  return `${seconds.toFixed(0)}s`;
}

/**
 * How close best share difficulty is to network difficulty (0–1+).
 * When bestDiff ≥ networkDiff, a block was found (or equivalent).
 */
export function bestShareProgress(bestShare: number, networkDifficulty: number): number {
  if (networkDifficulty <= 0 || bestShare <= 0) return 0;
  return bestShare / networkDifficulty;
}

/** Current subsidy after 2024 halving (block 840000). */
export function blockSubsidyAtHeight(height: number): number {
  const halvings = Math.floor(height / 210000);
  if (halvings >= 64) return 0;
  return 50 / 2 ** halvings;
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export function formatTimeAgo(unixSec: number, nowMs = Date.now()): string {
  if (!unixSec) return "—";
  const diff = Math.max(0, Math.floor(nowMs / 1000 - unixSec));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatUnix(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleString();
}

/**
 * Normalize miner/pool input: strip whitespace, worker suffix (addr.worker),
 * and common URL wrappers so pool lookup uses the bare payout address.
 */
export function normalizeBtcAddress(addr: string): string {
  let a = addr.trim().replace(/\s+/g, "");
  // worker style: bc1q....nerdqaxe /  bc1q....worker1
  const workerSplit = a.split(".");
  if (workerSplit.length >= 2) {
    const head = workerSplit[0];
    if (
      /^(bc1|tb1)/i.test(head) ||
      /^[13][a-km-zA-HJ-NP-Z1-9]+$/.test(head)
    ) {
      a = head;
    }
  }
  // path-style paste: .../users/bc1q...
  const usersIdx = a.toLowerCase().lastIndexOf("/users/");
  if (usersIdx >= 0) a = a.slice(usersIdx + "/users/".length);
  // query noise
  a = a.split("?")[0].split("#")[0];
  return a.trim();
}

/** Validate bech32 / legacy BTC address (lenient). */
export function isValidBtcAddress(addr: string): boolean {
  const a = normalizeBtcAddress(addr);
  if (a.length < 26 || a.length > 90) return false;
  // bech32 / bech32m
  if (/^(bc1|tb1)[a-z0-9]{8,87}$/i.test(a)) return true;
  // legacy / p2sh base58
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return true;
  return false;
}
