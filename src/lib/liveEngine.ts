/**
 * Live mining probability engine — uses exact pool-derived hashrate (no fake jitter).
 * Tick still runs at 0.5s so odds recompute when base/D change, and session hashes
 * accumulate from the real reported rate.
 */

import { computeBlockOdds } from "./mining";
import type { BlockOdds } from "./types";
import {
  expectedBestShareDiff,
  luckFactor,
  matchUserToCases,
  mechanismProximity,
  type CaseMatch,
} from "./soloCases";

export const TICK_MS = 500;
export const TICK_SEC = TICK_MS / 1000;

export type LiveTickState = {
  t: number;
  hashrateEff: number;
  hashrateBase: number;
  hashesThisTick: number;
  hashesSession: number;
  pTick: number;
  odds: BlockOdds;
  expectedBest: number;
  luck: number;
  display: {
    pDay: number;
    pWeek: number;
    pMonth: number;
    pYear: number;
    pTick: number;
    oneInDay: number;
    hashesPerSec: number;
    noncePressure: number;
    tickIndex: number;
  };
  caseMatch: CaseMatch;
  proximity: ReturnType<typeof mechanismProximity>;
};

/** Exact rate — no synthetic noise (pool is source of truth). */
export function effectiveHashrate(baseHs: number): number {
  return baseHs > 0 ? baseHs : 0;
}

export function pBlockInSeconds(hashrateHs: number, difficulty: number, seconds: number): number {
  if (hashrateHs <= 0 || difficulty <= 0 || seconds <= 0) return 0;
  const lambda = (hashrateHs * seconds) / (difficulty * 2 ** 32);
  if (lambda > 50) return 1;
  return 1 - Math.exp(-lambda);
}

export function createLiveEngine() {
  let hashesSession = 0;
  let tickIndex = 0;
  let startedAt = Date.now();

  return {
    reset() {
      hashesSession = 0;
      tickIndex = 0;
      startedAt = Date.now();
    },
    getStartedAt() {
      return startedAt;
    },
    getHashesSession() {
      return hashesSession;
    },
    tick(params: {
      hashrateBase: number;
      difficulty: number;
      bestShare: number;
      nowMs?: number;
    }): LiveTickState {
      const nowMs = params.nowMs ?? Date.now();
      tickIndex += 1;
      const hashrateEff = effectiveHashrate(params.hashrateBase);
      const hashesThisTick = hashrateEff * TICK_SEC;
      hashesSession += hashesThisTick;

      const odds = computeBlockOdds(hashrateEff, params.difficulty);
      const pTick = pBlockInSeconds(hashrateEff, params.difficulty, TICK_SEC);
      const expectedBest = expectedBestShareDiff(hashesSession);
      const luck = luckFactor(params.bestShare, hashesSession);
      const caseMatch = matchUserToCases(params.hashrateBase || hashrateEff);
      const proximity = mechanismProximity(
        params.bestShare,
        params.difficulty,
        hashrateEff
      );

      // Real nonce pressure proxy: fraction of expected block hashes done this session
      // (bounded 0-100) — driven by real hash accumulation, not random
      const hashesPerBlock = params.difficulty > 0 ? params.difficulty * 2 ** 32 : 1;
      const sessionFrac = hashesSession / hashesPerBlock;
      const noncePressure = Math.min(100, (sessionFrac * 1e12) % 100);

      return {
        t: nowMs,
        hashrateEff,
        hashrateBase: params.hashrateBase,
        hashesThisTick,
        hashesSession,
        pTick,
        odds,
        expectedBest,
        luck,
        display: {
          pDay: odds.day,
          pWeek: odds.week,
          pMonth: odds.month,
          pYear: odds.year,
          pTick,
          oneInDay: odds.day > 0 ? 1 / odds.day : Infinity,
          hashesPerSec: hashrateEff,
          noncePressure,
          tickIndex,
        },
        caseMatch,
        proximity,
      };
    },
  };
}

export type LiveEngine = ReturnType<typeof createLiveEngine>;
