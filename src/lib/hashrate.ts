import { parseHashrate } from "./mining";
import type { CkUserStats } from "./types";

/**
 * Pool hashrate (CKPool) — secondary only when device is offline.
 *
 * - instantHs: prefer 1m (closest to "now" on pool side)
 * - stableHs: 5m (smoother, closer to stats.ckpool.org headline)
 * - displayHs: prefer instant for live UI, fall back to stable
 */
export function selectStableHashrate(user: CkUserStats): {
  displayHs: number;
  instantHs: number;
  stableHs: number;
  source: "1m" | "5m" | "1hr" | "1d" | "blend";
  raw: { m1: number; m5: number; h1: number; d1: number };
} {
  const m1 = parseHashrate(user.hashrate1m);
  const m5 = parseHashrate(user.hashrate5m);
  const h1 = parseHashrate(user.hashrate1hr);
  const d1 = parseHashrate(user.hashrate1d);

  let stableHs = 0;
  let source: "1m" | "5m" | "1hr" | "1d" | "blend" = "5m";

  // Smooth pool baseline (5m), light 1h blend only when 5m present
  if (m5 > 0) {
    stableHs = m5;
    source = "5m";
    if (h1 > 0) {
      // Cap blend so we never invent spikes far above 5m
      const blended = m5 * 0.85 + h1 * 0.15;
      const cap = Math.max(m5, h1) * 1.15;
      stableHs = Math.min(blended, cap);
      source = "blend";
    }
  } else if (h1 > 0) {
    stableHs = h1;
    source = "1hr";
  } else if (m1 > 0) {
    stableHs = m1;
    source = "1m";
  } else if (d1 > 0) {
    stableHs = d1;
    source = "1d";
  }

  const instantHs = m1 > 0 ? m1 : stableHs;
  /**
   * Live monitor headline:
   * Prefer 1m (closest to "now"). If 1m is missing/zero, fall back to 5m/1h.
   * Never average down 1m into 5m — that made UI look stuck at ~5.x while 1m was higher.
   */
  const displayHs = m1 > 0 ? m1 : stableHs > 0 ? stableHs : 0;
  const displaySource: typeof source = m1 > 0 ? "1m" : source;

  return {
    displayHs,
    instantHs,
    stableHs,
    source: displaySource,
    raw: { m1, m5, h1, d1 },
  };
}

/**
 * DEVICE board is ground truth. Pool only if device unavailable.
 */
export function pickDisplayHashrate(opts: {
  deviceOnline: boolean;
  deviceHs: number;
  poolStableHs: number;
}): { hs: number; source: "device" | "pool" | "none" } {
  if (opts.deviceOnline && opts.deviceHs > 0 && Number.isFinite(opts.deviceHs)) {
    return { hs: opts.deviceHs, source: "device" };
  }
  if (opts.poolStableHs > 0 && Number.isFinite(opts.poolStableHs)) {
    return { hs: opts.poolStableHs, source: "pool" };
  }
  return { hs: 0, source: "none" };
}
