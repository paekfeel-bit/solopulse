import { parseHashrate } from "./mining";
import type { CkUserStats } from "./types";

/**
 * Pool hashrate selection for UI / source engine.
 *
 * CKPool 1m often spikes (e.g. 6.x T) above AxeOS board instant (~4.86 TH = 4862 GH/s).
 * Board sustained rate tracks closer to 5m / 1h. Use a board-matching stable blend
 * for the headline so site number ≈ miner homepage GH/s.
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

  /**
   * Board-matching (AxeOS ~4862 GH/s style):
   * Pool 1m often spikes high; 1h tracks board sustained best, 5m is secondary.
   * Cap 5m so short spikes cannot pull headline far above board.
   */
  if (h1 > 0 && m5 > 0) {
    const m5c = Math.min(m5, h1 * 1.08);
    stableHs = h1 * 0.75 + m5c * 0.25;
    source = "blend";
  } else if (h1 > 0) {
    stableHs = h1;
    source = "1hr";
  } else if (m5 > 0) {
    stableHs = m5;
    source = "5m";
  } else if (m1 > 0) {
    stableHs = m1;
    source = "1m";
  } else if (d1 > 0) {
    stableHs = d1;
    source = "1d";
  }

  const instantHs = m1 > 0 ? m1 : stableHs;
  // Headline stays on stable — never use raw 1m (causes 5–6T vs board 4.86T)
  const displayHs = stableHs > 0 ? stableHs : instantHs;

  return {
    displayHs,
    instantHs,
    stableHs,
    source,
    raw: { m1, m5, h1, d1 },
  };
}

/**
 * DEVICE board is ground truth when online. Pool otherwise.
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
