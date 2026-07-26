/**
 * ETA for source-contact steps that can grow with time (not block luck).
 * Ladder step to network difficulty ≈ block find (same Poisson) — shown honestly.
 */

import { expectedBlockTimeSeconds, formatDuration } from "./mining";
import type { SourceContact } from "./sourceContact";

export type ContactEta = {
  /** Seconds until runtime/share steps could max out (achievable alignment) */
  achievableSec: number | null;
  /** Projected overall % after achievable steps fill (excluding true lottery ladder) */
  projectedOverallWithoutLottery: number;
  /** Full 100% including best≥network needs a block — same as expected block time */
  full100Sec: number | null;
  /** Human labels */
  achievableLabel: string;
  full100Label: string;
  note: { ko: string; en: string; ja: string };
  blockingSteps: string[];
};

export function estimateContactEta(input: {
  contact: SourceContact;
  hashrateHs: number;
  networkDiff: number;
  bestShare: number;
  lastShareUnix: number;
  authorisedUnix: number;
  shares: number;
  nowMs?: number;
}): ContactEta {
  const now = (input.nowMs ?? Date.now()) / 1000;
  const steps = input.contact.steps;
  const blocking: string[] = [];

  // Per-step remaining time for deterministic scores
  let maxWait = 0;

  for (const s of steps) {
    if (s.score >= 0.99) continue;
    if (s.id === "online") {
      // if offline, unknown
      if (s.score < 0.5) {
        blocking.push("online");
        maxWait = Math.max(maxWait, 120); // need ~2m of shares
      }
    } else if (s.id === "band") {
      if (s.score < 0.9) {
        blocking.push("band");
        // can't ETA HR band if hardware too weak — leave null contribution
      }
    } else if (s.id === "pool") {
      if (s.score < 0.9) blocking.push("pool");
    } else if (s.id === "shares") {
      // score 1 at >1e5 shares roughly
      const need = 100_000;
      const have = input.shares;
      if (have < need && input.hashrateHs > 0) {
        // Rough: shares grow with hashrate but pool share diff varies.
        // Use remaining fraction * 1 day as soft estimate if growing
        const frac = 1 - Math.min(1, have / need);
        const est = frac * 86400 * 2; // soft
        maxWait = Math.max(maxWait, est);
        blocking.push("shares");
      }
    } else if (s.id === "runtime") {
      // full score at 30d authorised
      const age = input.authorisedUnix > 0 ? now - input.authorisedUnix : 0;
      const need = 30 * 86400;
      if (age < need) {
        maxWait = Math.max(maxWait, need - age);
        blocking.push("runtime");
      } else if (age < 7 * 86400) {
        maxWait = Math.max(maxWait, 7 * 86400 - age);
        blocking.push("runtime");
      }
    } else if (s.id === "ladder") {
      // lottery — not time-deterministic except expected block time
      blocking.push("ladder");
    }
  }

  // Projected overall if all non-ladder steps maxed
  let sum = 0;
  for (const s of steps) {
    if (s.id === "ladder") {
      // keep current ladder score (can't force without luck)
      sum += s.score;
    } else {
      sum += 1;
    }
  }
  const projected = (sum / steps.length) * 100;

  const blockEta = expectedBlockTimeSeconds(input.hashrateHs, input.networkDiff);
  const full100Sec =
    input.networkDiff > 0 && input.bestShare >= input.networkDiff
      ? 0
      : Number.isFinite(blockEta)
        ? blockEta
        : null;

  const achievableSec =
    blocking.filter((b) => b !== "ladder" && b !== "band" && b !== "pool").length === 0 &&
    maxWait === 0
      ? 0
      : maxWait > 0
        ? maxWait
        : null;

  return {
    achievableSec,
    projectedOverallWithoutLottery: projected,
    full100Sec,
    achievableLabel:
      achievableSec === null
        ? "—"
        : achievableSec === 0
          ? "ready"
          : formatDuration(achievableSec),
    full100Label:
      full100Sec === null
        ? "—"
        : full100Sec === 0
          ? "block!"
          : formatDuration(full100Sec),
    note: {
      ko: "정렬 가능한 단계(가동·셰어 등) ETA와, 사다리 100%(=블록) 기대 시간은 다릅니다. 후자는 복권 기대값입니다.",
      en: "ETA for fillable steps ≠ time to ladder 100% (needs a block — lottery EV).",
      ja: "埋められる段階のETAと梯子100%(ブロック)の期待時間は別。後者は宝くじEV。",
    },
    blockingSteps: blocking,
  };
}
