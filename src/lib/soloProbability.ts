/**
 * SoloPulse mathematical core — network share, Poisson lottery, Monte Carlo.
 *
 * Canonical identities (Bitcoin SHA-256 PoW):
 *
 *   P(one hash is a valid block) = 1 / (D · 2³²)
 *
 *   Network hashrate (H/s) from difficulty (600s block target):
 *     H_net ≈ D · 2³² / 600
 *
 *   Share of network:
 *     s = h_user / H_net
 *       = h_user · 600 / (D · 2³²)     (equiv. form)
 *
 *   Poisson rate (blocks / second):
 *     λ = h / (D · 2³²) = s / 600
 *
 *   P(≥1 block in T seconds) = 1 − exp(−λ T)
 *
 *   Waiting time ~ Exp(λ):  E[T] = 1/λ ,  median = ln(2)/λ
 *
 * Monte Carlo draws waiting times via inverse CDF: T = −ln(U)/λ
 * and compares empirical hit rates to closed-form Poisson.
 */

export const TWO_32 = 2 ** 32; // 4_294_967_296
export const BLOCK_TARGET_SEC = 600;
export const BLOCKS_PER_DAY = 144; // 86400 / 600

export type SoloMathCore = {
  hashrateHs: number;
  hashrateTh: number;
  networkHashrateHs: number;
  networkHashrateEh: number;
  difficulty: number;
  /** s = h / H_net  (0–1) */
  networkShare: number;
  /** percent form of s */
  networkSharePct: number;
  /** P(hash is block) */
  pHash: number;
  /** λ blocks per second */
  lambdaPerSec: number;
  lambdaPerDay: number;
  expectedSeconds: number;
  expectedDays: number;
  expectedYears: number;
  medianSeconds: number;
  medianYears: number;
  poisson: {
    day: number;
    week: number;
    month: number;
    year: number;
    d30: number;
    d90: number;
  };
  /** one-in-N for a day (1/p) */
  oneInDay: number;
  formulas: {
    pHash: string;
    share: string;
    lambda: string;
    poissonT: string;
    expected: string;
  };
};

export type MonteCarloSoloResult = {
  trials: number;
  horizonDays: number;
  hitsIn30d: number;
  hitsIn90d: number;
  hitsIn1y: number;
  hitsIn10y: number;
  rate30d: number;
  rate90d: number;
  rate1y: number;
  rate10y: number;
  /** empirical vs closed-form absolute error on 30d P */
  absErr30d: number;
  earliestHitDays: number | null;
  /** percentiles of waiting time (years), only among hits within horizon */
  p25Years: number | null;
  p50Years: number | null;
  p75Years: number | null;
  p90Years: number | null;
  closedForm: {
    p30: number;
    p90: number;
    p1y: number;
    p10y: number;
  };
  seed: number;
};

/** H_net (H/s) from difficulty assuming 600s target. */
export function networkHashrateFromDifficulty(difficulty: number): number {
  if (!(difficulty > 0)) return 0;
  return (difficulty * TWO_32) / BLOCK_TARGET_SEC;
}

/**
 * Prefer measured network hashrate; fall back to difficulty-derived.
 */
export function resolveNetworkHashrate(
  measuredHs: number | null | undefined,
  difficulty: number
): number {
  if (measuredHs != null && Number.isFinite(measuredHs) && measuredHs > 0) {
    return measuredHs;
  }
  return networkHashrateFromDifficulty(difficulty);
}

/** s = h_user / H_net */
export function networkShareFraction(
  userHashrateHs: number,
  networkHashrateHs: number
): number {
  if (!(userHashrateHs > 0) || !(networkHashrateHs > 0)) return 0;
  return userHashrateHs / networkHashrateHs;
}

/** Equivalent: s = h · 600 / (D · 2³²) */
export function networkShareFromDifficulty(
  userHashrateHs: number,
  difficulty: number
): number {
  if (!(userHashrateHs > 0) || !(difficulty > 0)) return 0;
  return (userHashrateHs * BLOCK_TARGET_SEC) / (difficulty * TWO_32);
}

export function lambdaPerSecond(userHashrateHs: number, difficulty: number): number {
  if (!(userHashrateHs > 0) || !(difficulty > 0)) return 0;
  return userHashrateHs / (difficulty * TWO_32);
}

export function poissonAtLeastOne(
  userHashrateHs: number,
  difficulty: number,
  seconds: number
): number {
  const lam = lambdaPerSecond(userHashrateHs, difficulty) * seconds;
  if (lam <= 0) return 0;
  if (lam > 50) return 1;
  return 1 - Math.exp(-lam);
}

/**
 * Reference form (share p, Poisson):
 *   p = userTH * 1e12 / (netEH * 1e18)
 *   basicProb = 1 - exp(-p * days * 144)
 * ≡ 1 - exp(-s · blocksInWindow)
 */
export function calculateSoloProbability(
  userHashrateTH: number,
  networkHashrateEH: number,
  timeInDays: number
): {
  p: number;
  share: number;
  basicProb: number;
  blocksExpected: number;
  userHashrateTH: number;
  networkHashrateEH: number;
  timeInDays: number;
} {
  const userHs = userHashrateTH * 1e12;
  const netHs = networkHashrateEH * 1e18;
  const p = networkShareFraction(userHs, netHs); // network share fraction
  const blocksExpected = p * timeInDays * BLOCKS_PER_DAY;
  const basicProb =
    blocksExpected <= 0
      ? 0
      : blocksExpected > 50
        ? 1
        : 1 - Math.exp(-blocksExpected);
  return {
    p,
    share: p,
    basicProb,
    blocksExpected,
    userHashrateTH,
    networkHashrateEH,
    timeInDays,
  };
}

export type McFromShareResult = {
  trials: number;
  timeInDays: number;
  /** network share fraction used as input */
  p: number;
  /** empirical P(hit within timeInDays) */
  hitRate: number;
  hits: number;
  /** closed-form 1 − e^(−p · days · 144) */
  basicProb: number;
  absError: number;
  /** mean waiting days among hits (capped) */
  meanHitDays: number | null;
  earliestHitDays: number | null;
  seed: number;
};

/**
 * Monte Carlo from network share p (user snippet API):
 *   runMonteCarloSimulation(p, timeInDays, 20000)
 *
 * Model: each ~10m block is won with probability p independently
 * (equiv. Poisson: blocks ~ Poisson(p · days · 144)).
 * Waiting time in days: T = −ln(U) / (p · 144)
 */
export function runMonteCarloSimulation(
  p: number,
  timeInDays: number,
  trials = 20_000,
  seed?: number
): McFromShareResult {
  const n = Math.max(1, Math.floor(trials));
  const days = Math.max(0, timeInDays);
  const lambdaPerDay = p > 0 ? p * BLOCKS_PER_DAY : 0; // p · 144
  const basicProb =
    lambdaPerDay <= 0 || days <= 0
      ? 0
      : lambdaPerDay * days > 50
        ? 1
        : 1 - Math.exp(-lambdaPerDay * days);

  const seedFinal =
    seed ??
    ((Math.floor(p * 1e15) ^
      (Math.floor(days * 1000) * 0x9e3779b9) ^
      0xc0ffee) >>>
      0);

  const rng = mulberry32(seedFinal);
  let hits = 0;
  let earliest: number | null = null;
  let sumHitDays = 0;

  if (lambdaPerDay <= 0 || days <= 0) {
    return {
      trials: n,
      timeInDays: days,
      p,
      hitRate: 0,
      hits: 0,
      basicProb,
      absError: basicProb,
      meanHitDays: null,
      earliestHitDays: null,
      seed: seedFinal,
    };
  }

  for (let i = 0; i < n; i++) {
    const u = Math.max(1e-15, rng());
    const tDays = -Math.log(u) / lambdaPerDay;
    if (tDays <= days) {
      hits++;
      sumHitDays += tDays;
      if (earliest == null || tDays < earliest) earliest = tDays;
    }
  }

  const hitRate = hits / n;
  return {
    trials: n,
    timeInDays: days,
    p,
    hitRate,
    hits,
    basicProb,
    absError: Math.abs(hitRate - basicProb),
    meanHitDays: hits > 0 ? sumHitDays / hits : null,
    earliestHitDays: earliest,
    seed: seedFinal,
  };
}

/** Variance disclaimer (multi-locale) for solo lottery outcomes */
export const VARIANCE_NOTE = {
  ko: "솔로 마이닝은 분산이 매우 큽니다. 기대 블록 수·확률은 장기 평균일 뿐, 짧은 구간에서는 0 또는 극단값이 흔합니다. 100% 점유/정렬 ≠ 당첨 확정.",
  en: "Solo mining has extreme variance. Expected blocks & probabilities are long-run averages — short windows often see 0 or rare spikes. 100% alignment ≠ a guaranteed win.",
  ja: "ソロマイニングは分散が非常に大きいです。期待ブロック数・確率は長期平均であり、短期間では0や極端値が普通です。100%整合≠当選確定。",
} as const;

export type SoloProbabilityBundle = {
  /** network share fraction 0–1 (alias of p) */
  p: number;
  /** network share as percent: p * 100 */
  networkShare: number;
  /** Poisson P(≥1 block in window) */
  basicProbability: number;
  /** @deprecated use basicProbability */
  basicProb: number;
  /** p * timeInDays * 144 */
  expectedBlocks: number;
  /** @deprecated use expectedBlocks */
  blocksExpected: number;
  userHashrateTH: number;
  networkHashrateEH: number;
  timeInDays: number;
  /** Monte Carlo payload */
  monteCarlo: McFromShareResult;
  /** @deprecated use monteCarlo */
  mcResult: McFromShareResult;
  varianceNote: string;
  varianceNoteI18n: typeof VARIANCE_NOTE;
  formulas: {
    p: string;
    basicProb: string;
    mc: string;
    expectedBlocks: string;
  };
};

/**
 * Improved full pipeline (canonical return shape):
 *
 *   const p = userTH * 1e12 / (netEH * 1e18)
 *   const basicProb = 1 - Math.exp(-p * (timeInDays * 144))
 *   const mcResult = runMonteCarloSimulation(p, timeInDays, 20000)
 *   return {
 *     networkShare: p * 100,
 *     basicProbability: basicProb,
 *     monteCarlo: mcResult,
 *     expectedBlocks: p * timeInDays * 144,
 *     varianceNote: "솔로 마이닝은 분산이 매우 큽니다..."
 *   }
 */
export function calculateSoloProbabilityWithMc(
  userHashrateTH: number,
  networkHashrateEH: number,
  timeInDays: number,
  trials = 20_000,
  locale: "ko" | "en" | "ja" = "ko"
): SoloProbabilityBundle {
  const base = calculateSoloProbability(
    userHashrateTH,
    networkHashrateEH,
    timeInDays
  );
  const p = base.p;
  const basicProb = base.basicProb;
  const expectedBlocks = p * timeInDays * BLOCKS_PER_DAY; // p * days * 144
  const mcResult = runMonteCarloSimulation(p, timeInDays, trials);

  return {
    p,
    networkShare: p * 100,
    basicProbability: basicProb,
    basicProb,
    expectedBlocks,
    blocksExpected: expectedBlocks,
    userHashrateTH,
    networkHashrateEH,
    timeInDays,
    monteCarlo: mcResult,
    mcResult,
    varianceNote: VARIANCE_NOTE[locale] || VARIANCE_NOTE.ko,
    varianceNoteI18n: VARIANCE_NOTE,
    formulas: {
      p: "p = TH_user·10¹² / (EH_net·10¹⁸)  // network share fraction",
      basicProb: "basicProbability = 1 − exp(−p · days · 144)",
      mc: "monteCarlo = runMonteCarloSimulation(p, timeInDays, 20000)",
      expectedBlocks: "expectedBlocks = p · timeInDays · 144",
    },
  };
}

/**
 * Async version: pulls network via multi-API /api/network fallback.
 * Drop-in for:
 *   async function calculateSoloProbability(userHashrateTH, timeInDays)
 */
export async function calculateSoloProbabilityAsync(
  userHashrateTH: number,
  timeInDays: number,
  trials = 20_000
): Promise<
  SoloProbabilityBundle & {
    netStats: {
      hashrateEH: number;
      hashrateHs: number;
      difficulty: number;
      sources?: string[];
    };
  }
> {
  const netStats = await getNetworkStatsWithFallback();
  const bundle = calculateSoloProbabilityWithMc(
    userHashrateTH,
    netStats.hashrateEH,
    timeInDays,
    trials
  );
  return { ...bundle, netStats };
}

/** Client/server: same-origin multi-API network bundle. */
export async function getNetworkStatsWithFallback(): Promise<{
  hashrateEH: number;
  hashrateHs: number;
  difficulty: number;
  sources?: string[];
  priceUsd?: number;
  blockHeight?: number;
}> {
  // Prefer our API (already multi-fallback server-side)
  try {
    const res = await fetch(
      typeof window !== "undefined"
        ? `/api/network?_=${Date.now()}`
        : "http://127.0.0.1:3000/api/network",
      { cache: "no-store" }
    );
    if (res.ok) {
      const j = await res.json();
      const hs = Number(j.hashrate) || 0;
      const D = Number(j.difficulty) || 0;
      const derived = D > 0 ? networkHashrateFromDifficulty(D) : 0;
      const hashrateHs = hs > 0 ? hs : derived;
      return {
        hashrateHs,
        hashrateEH: hashrateHs / 1e18,
        difficulty: D,
        sources: Array.isArray(j.sources) ? j.sources : ["api.network"],
        priceUsd: Number(j.priceUsd) || undefined,
        blockHeight: Number(j.blockHeight) || undefined,
      };
    }
  } catch {
    /* fall through */
  }

  // Browser CORS-friendly last resorts
  try {
    const [hr, tip] = await Promise.all([
      fetch("https://mempool.space/api/v1/mining/hashrate/3d", {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("https://mempool.space/api/blocks/tip/height", {
        cache: "no-store",
      }).then((r) => r.json()),
    ]);
    const D = Number(hr?.currentDifficulty) || 0;
    const hs =
      Number(hr?.currentHashrate) ||
      (D > 0 ? networkHashrateFromDifficulty(D) : 0);
    return {
      hashrateHs: hs,
      hashrateEH: hs / 1e18,
      difficulty: D,
      sources: ["mempool.direct"],
      blockHeight: Number(tip) || undefined,
    };
  } catch {
    return {
      hashrateHs: 0,
      hashrateEH: 0,
      difficulty: 0,
      sources: ["unavailable"],
    };
  }
}

export function buildSoloMathCore(input: {
  hashrateHs: number;
  difficulty: number;
  networkHashrateHs?: number | null;
}): SoloMathCore {
  const h = input.hashrateHs > 0 ? input.hashrateHs : 0;
  const D = input.difficulty > 0 ? input.difficulty : 0;
  const Hnet = resolveNetworkHashrate(input.networkHashrateHs, D);
  const share =
    Hnet > 0 ? networkShareFraction(h, Hnet) : networkShareFromDifficulty(h, D);
  const pHash = D > 0 ? 1 / (D * TWO_32) : 0;
  const lambda = lambdaPerSecond(h, D);
  const expSec = lambda > 0 ? 1 / lambda : Infinity;
  const medSec = lambda > 0 ? Math.LN2 / lambda : Infinity;

  const DAY = 86400;
  const poisson = {
    day: poissonAtLeastOne(h, D, DAY),
    week: poissonAtLeastOne(h, D, 7 * DAY),
    month: poissonAtLeastOne(h, D, 30 * DAY),
    year: poissonAtLeastOne(h, D, 365.25 * DAY),
    d30: poissonAtLeastOne(h, D, 30 * DAY),
    d90: poissonAtLeastOne(h, D, 90 * DAY),
  };

  return {
    hashrateHs: h,
    hashrateTh: h / 1e12,
    networkHashrateHs: Hnet,
    networkHashrateEh: Hnet / 1e18,
    difficulty: D,
    networkShare: share,
    networkSharePct: share * 100,
    pHash,
    lambdaPerSec: lambda,
    lambdaPerDay: lambda * DAY,
    expectedSeconds: expSec,
    expectedDays: expSec / DAY,
    expectedYears: expSec / (365.25 * DAY),
    medianSeconds: medSec,
    medianYears: medSec / (365.25 * DAY),
    poisson,
    oneInDay: poisson.day > 0 ? 1 / poisson.day : Infinity,
    formulas: {
      pHash: "P(hash)=1/(D·2³²)",
      share: "s = h/H_net = h·600/(D·2³²)",
      lambda: "λ = h/(D·2³²) = s/600  [blocks/s]",
      poissonT: "P(≥1 in T)=1−e^(−λT)",
      expected: "E[T]=1/λ ,  median=ln2/λ",
    },
  };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * High-fidelity Monte Carlo for waiting time to first solo block.
 * Inverse-CDF sampling: T_days = −ln(U) / λ_day
 */
export function runMonteCarloSolo(params: {
  hashrateHs: number;
  difficulty: number;
  trials?: number;
  horizonDays?: number;
  seed?: number;
}): MonteCarloSoloResult {
  const trials = params.trials ?? 20_000;
  const horizonDays = params.horizonDays ?? 365.25 * 100; // 100y
  const seed =
    params.seed ??
    ((Math.floor(params.hashrateHs / 1e8) ^
      Math.floor(params.difficulty / 1e10) ^
      0xc0ffee) >>>
      0);

  const lambdaSec = lambdaPerSecond(params.hashrateHs, params.difficulty);
  const lambdaDay = lambdaSec * 86400;
  const rng = mulberry32(seed);

  const closedForm = {
    p30: poissonAtLeastOne(params.hashrateHs, params.difficulty, 30 * 86400),
    p90: poissonAtLeastOne(params.hashrateHs, params.difficulty, 90 * 86400),
    p1y: poissonAtLeastOne(params.hashrateHs, params.difficulty, 365.25 * 86400),
    p10y: poissonAtLeastOne(params.hashrateHs, params.difficulty, 10 * 365.25 * 86400),
  };

  let hits30 = 0;
  let hits90 = 0;
  let hits1y = 0;
  let hits10y = 0;
  let earliest: number | null = null;
  const hitDays: number[] = [];

  if (lambdaDay <= 0) {
    return {
      trials,
      horizonDays,
      hitsIn30d: 0,
      hitsIn90d: 0,
      hitsIn1y: 0,
      hitsIn10y: 0,
      rate30d: 0,
      rate90d: 0,
      rate1y: 0,
      rate10y: 0,
      absErr30d: closedForm.p30,
      earliestHitDays: null,
      p25Years: null,
      p50Years: null,
      p75Years: null,
      p90Years: null,
      closedForm,
      seed,
    };
  }

  for (let i = 0; i < trials; i++) {
    const u = Math.max(1e-15, rng());
    const days = -Math.log(u) / lambdaDay;
    if (days > horizonDays) continue;
    hitDays.push(days);
    if (earliest == null || days < earliest) earliest = days;
    if (days <= 30) hits30++;
    if (days <= 90) hits90++;
    if (days <= 365.25) hits1y++;
    if (days <= 3652.5) hits10y++;
  }

  hitDays.sort((a, b) => a - b);
  const pct = (q: number): number | null => {
    if (!hitDays.length) return null;
    const idx = Math.min(
      hitDays.length - 1,
      Math.max(0, Math.floor(q * (hitDays.length - 1)))
    );
    return hitDays[idx] / 365.25;
  };

  const rate30d = hits30 / trials;
  return {
    trials,
    horizonDays,
    hitsIn30d: hits30,
    hitsIn90d: hits90,
    hitsIn1y: hits1y,
    hitsIn10y: hits10y,
    rate30d,
    rate90d: hits90 / trials,
    rate1y: hits1y / trials,
    rate10y: hits10y / trials,
    absErr30d: Math.abs(rate30d - closedForm.p30),
    earliestHitDays: earliest,
    p25Years: pct(0.25),
    p50Years: pct(0.5),
    p75Years: pct(0.75),
    p90Years: pct(0.9),
    closedForm,
    seed,
  };
}

/** High-precision share percent for UI (many decimals, never rounds to 0 spuriously). */
export function formatNetworkSharePct(shareFraction: number, maxDecimals = 14): string {
  if (!Number.isFinite(shareFraction) || shareFraction <= 0) return "0%";
  const pct = shareFraction * 100;
  if (pct >= 1) return `${pct.toFixed(6)}%`;
  if (pct >= 0.01) return `${pct.toFixed(8)}%`;
  if (pct >= 1e-6) return `${pct.toFixed(10)}%`;
  // scientific for ultra-small
  return `${pct.toExponential(maxDecimals - 4)}%`;
}

/** Fixed many-decimal display (user request: show more decimals, emphasize). */
export function formatNetworkSharePctFixed(
  shareFraction: number,
  decimals = 12
): string {
  if (!Number.isFinite(shareFraction) || shareFraction <= 0) {
    return `0.${"0".repeat(decimals)}%`;
  }
  const pct = shareFraction * 100;
  if (pct > 0 && pct < Math.pow(10, -decimals)) {
    return pct.toExponential(6) + "%";
  }
  return `${pct.toFixed(decimals)}%`;
}

export function formatSciProb(p: number, digits = 6): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 0.999999) return "~1";
  if (p >= 0.01) return p.toFixed(6);
  return p.toExponential(digits);
}
