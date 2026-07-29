/**
 * SoloPulse Engine v2.5 — Enhanced Block Readiness helpers
 * (Gumbel EVT · effective HR · retarget · acceleration · fee EV · block detect)
 */

export interface BestShareTrend {
  timestamps: number[];
  values: number[];
}

export interface ShareSample {
  timestamp: number;
  shares: number;
  shareDifficulty?: number;
}

export interface HashratePoint {
  timestamp: number;
  hashrateHs: number;
}

export interface MempoolState {
  txCount: number;
  medianFeeRate: number;
  totalFees: number;
  blockTemplateFee?: number;
}

export type EnhancedBundle = {
  gumbel: {
    pBlock24h: number;
    pBlock1h: number;
    pBlock7d: number;
    pBlock30d: number;
    trendScore: number;
    mu: number;
    sigma: number;
  };
  effective: {
    hashrateHs: number;
    variance: number;
    confidence: number;
    vsAdvertised: number;
  };
  retarget: {
    predictedDiff: number;
    changePct: number;
    confidence: number;
    adjustedET: number;
  };
  acceleration: {
    velocity: number;
    acceleration: number;
    score: number;
  };
  reward: {
    baseReward: number;
    feeReward: number;
    totalReward: number;
    feeRatio: number;
  };
  /** 0–99.9 composite readiness (100 only when blockDetected) */
  blockReadiness: number;
  blockDetected: boolean;
};

/** Gumbel-style EVT on log10(bestShare) trend → P(reach D in horizon) */
export function gumbelBlockProbability(
  trend: BestShareTrend,
  networkDiff: number,
  horizonHours: number
): { probability: number; mu: number; sigma: number; trendScore: number } {
  if (trend.values.length < 3 || networkDiff <= 0) {
    return { probability: 0, mu: 0, sigma: 0, trendScore: 0 };
  }

  const logValues = trend.values.map((v) => Math.log10(Math.max(1, v)));
  const n = logValues.length;
  let sumT = 0,
    sumV = 0,
    sumTT = 0,
    sumTV = 0,
    sumW = 0;
  const now = Date.now() / 1000;

  for (let i = 0; i < n; i++) {
    const age = Math.max(0, now - (trend.timestamps[i] || now));
    const w = Math.exp(-age / 3600);
    const t = i;
    sumW += w;
    sumT += w * t;
    sumV += w * logValues[i];
    sumTT += w * t * t;
    sumTV += w * t * logValues[i];
  }

  const den = sumW * sumTT - sumT * sumT;
  if (Math.abs(den) < 1e-12 || sumW <= 0) {
    return { probability: 0, mu: logValues[n - 1], sigma: 0.1, trendScore: 0.5 };
  }

  const slope = (sumW * sumTV - sumT * sumV) / den;
  const intercept = (sumV - slope * sumT) / sumW;
  const residuals = logValues.map((v, i) => v - (intercept + slope * i));
  const variance = residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n);
  const sigma = Math.max(0.01, Math.sqrt(variance * 6) / Math.PI);
  const mu = intercept + slope * (n - 1);
  const futureIndex = n - 1 + (horizonHours * 3600) / 300;
  const predictedLog = intercept + slope * futureIndex;
  const logD = Math.log10(networkDiff);
  const z = (logD - predictedLog) / sigma;
  const cdf = Math.exp(-Math.exp(-Math.max(-50, Math.min(50, z))));
  const trendScore = Math.max(0, Math.min(1, (slope * n) / 2 + 0.5));

  return {
    probability: Math.max(0, Math.min(1, 1 - cdf)),
    mu,
    sigma,
    trendScore,
  };
}

/** shares Δ → effective hashrate H/s */
export function calculateEffectiveHashrate(
  samples: ShareSample[],
  windowSeconds = 300
): { effectiveHs: number; variance: number; confidence: number } {
  if (samples.length < 2) {
    return { effectiveHs: 0, variance: 0, confidence: 0 };
  }
  const now = Date.now() / 1000;
  const recent = samples.filter((s) => now - s.timestamp <= windowSeconds);
  if (recent.length < 2) {
    return { effectiveHs: 0, variance: 0, confidence: 0 };
  }
  const first = recent[0];
  const last = recent[recent.length - 1];
  const timeDelta = last.timestamp - first.timestamp;
  const sharesDelta = last.shares - first.shares;
  const shareDiff = last.shareDifficulty || first.shareDifficulty || 1;
  if (timeDelta <= 0 || sharesDelta < 0) {
    return { effectiveHs: 0, variance: 0, confidence: 0 };
  }
  const effectiveHs = (sharesDelta * shareDiff * Math.pow(2, 32)) / timeDelta;
  let varianceSum = 0;
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    const dt = recent[i].timestamp - recent[i - 1].timestamp;
    const ds = recent[i].shares - recent[i - 1].shares;
    if (dt > 0) {
      const hr = (ds * shareDiff * Math.pow(2, 32)) / dt;
      varianceSum += Math.pow(hr - effectiveHs, 2);
      count++;
    }
  }
  return {
    effectiveHs,
    variance: count > 0 ? varianceSum / count : 0,
    confidence: Math.min(1, count / 10),
  };
}

export function predictRetarget(
  recentIntervalsSec: number[],
  currentDifficulty: number
): { predictedDiff: number; changePct: number; confidence: number } {
  if (recentIntervalsSec.length < 10 || currentDifficulty <= 0) {
    return { predictedDiff: currentDifficulty, changePct: 0, confidence: 0 };
  }
  const avgInterval =
    recentIntervalsSec.reduce((a, b) => a + b, 0) / recentIntervalsSec.length;
  if (!(avgInterval > 0)) {
    return { predictedDiff: currentDifficulty, changePct: 0, confidence: 0 };
  }
  const changeRatio = 600 / avgInterval;
  // Clamp Bitcoin-like retarget extremes (~4x)
  const clamped = Math.max(0.25, Math.min(4, changeRatio));
  const predictedDiff = currentDifficulty * clamped;
  return {
    predictedDiff,
    changePct: (clamped - 1) * 100,
    confidence: Math.min(1, recentIntervalsSec.length / 144),
  };
}

export function calculateAcceleration(points: HashratePoint[]): {
  velocity: number;
  acceleration: number;
  score: number;
} {
  if (points.length < 3) {
    return { velocity: 0, acceleration: 0, score: 0.5 };
  }
  const recent = points.slice(-10);
  const dt =
    recent[recent.length - 1].timestamp - recent[0].timestamp || 1;
  const v1 =
    (recent[recent.length - 1].hashrateHs - recent[0].hashrateHs) / dt;
  let accSum = 0;
  let accCount = 0;
  for (let i = 2; i < recent.length; i++) {
    const dt1 = recent[i - 1].timestamp - recent[i - 2].timestamp;
    const dt2 = recent[i].timestamp - recent[i - 1].timestamp;
    if (dt1 <= 0 || dt2 <= 0) continue;
    const vPrev =
      (recent[i - 1].hashrateHs - recent[i - 2].hashrateHs) / dt1;
    const vCurr = (recent[i].hashrateHs - recent[i - 1].hashrateHs) / dt2;
    accSum += (vCurr - vPrev) / ((dt1 + dt2) / 2);
    accCount++;
  }
  const acceleration = accCount > 0 ? accSum / accCount : 0;
  // Soft score: stable small miners sit ~0.5–0.7
  const score = Math.max(
    0,
    Math.min(1, 0.5 + Math.tanh(v1 / 1e9) * 0.25 + Math.tanh(acceleration / 1e6) * 0.25)
  );
  return { velocity: v1, acceleration, score };
}

export function calculateDynamicReward(
  mempool: MempoolState | null,
  baseReward = 3.125
): {
  baseReward: number;
  feeReward: number;
  totalReward: number;
  feeRatio: number;
} {
  if (!mempool) {
    return { baseReward, feeReward: 0, totalReward: baseReward, feeRatio: 0 };
  }
  const feeReward =
    mempool.blockTemplateFee ??
    (mempool.totalFees > 0
      ? mempool.totalFees
      : (mempool.txCount * mempool.medianFeeRate * 200) / 1e8);
  const totalReward = baseReward + Math.max(0, feeReward);
  return {
    baseReward,
    feeReward: Math.max(0, feeReward),
    totalReward,
    feeRatio: totalReward > 0 ? Math.max(0, feeReward) / totalReward : 0,
  };
}

/**
 * Composite 0–99.9 readiness; 100 only via blockDetected path in UI.
 */
export function computeBlockReadiness(params: {
  bestShare: number;
  difficulty: number;
  expectedYears: number;
  gumbel24h: { probability: number; trendScore: number };
  effective: { variance: number; confidence: number; effectiveHs: number };
  useHashrate: number;
  accelScore: number;
  retarget: { changePct: number; confidence: number };
}): number {
  const { bestShare, difficulty: D } = params;
  let readiness = 0;
  const progress = D > 0 ? bestShare / D : 0;
  // log progress 0–40
  readiness += Math.min(
    40,
    (Math.log10(1 + progress * 1e12) / 12) * 40
  );
  // EVT 0–25
  readiness +=
    params.gumbel24h.probability * 25 * Math.max(0.2, params.gumbel24h.trendScore);
  // stability 0–15
  const varRatio =
    params.useHashrate > 0
      ? Math.min(1, params.effective.variance / Math.pow(params.useHashrate, 2))
      : 1;
  readiness +=
    (1 - varRatio) * 15 * Math.max(0.15, params.effective.confidence || 0.15);
  // acceleration 0–10
  readiness += params.accelScore * 10;
  // retarget favor (easier) 0–10
  if (params.retarget.changePct < 0) {
    readiness +=
      Math.min(10, Math.abs(params.retarget.changePct) * 0.5) *
      params.retarget.confidence;
  }
  // soft poisson presence 0–5 from 1/E[T]
  if (Number.isFinite(params.expectedYears) && params.expectedYears > 0) {
    readiness += Math.min(5, (1 / params.expectedYears) * 50);
  }
  return Math.min(99.9, Math.max(0, readiness));
}

export function buildEnhancedBundle(input: {
  hashrateHs: number;
  difficulty: number;
  bestShare: number;
  expectedYears: number;
  bestShareTrend?: BestShareTrend;
  shareSamples?: ShareSample[];
  hashrateHistory?: HashratePoint[];
  recentBlockIntervalsSec?: number[];
  mempool?: MempoolState | null;
  baseReward?: number;
}): EnhancedBundle {
  const h = input.hashrateHs;
  const D = input.difficulty;
  const trend = input.bestShareTrend ?? { timestamps: [], values: [] };

  // Seed synthetic trend from current best so EVT has something when history thin
  const seededTrend: BestShareTrend =
    trend.values.length >= 3
      ? trend
      : input.bestShare > 0
        ? {
            timestamps: [
              Date.now() / 1000 - 600,
              Date.now() / 1000 - 300,
              Date.now() / 1000,
            ],
            values: [
              input.bestShare * 0.7,
              input.bestShare * 0.9,
              input.bestShare,
            ],
          }
        : trend;

  const g1 = gumbelBlockProbability(seededTrend, D, 1);
  const g24 = gumbelBlockProbability(seededTrend, D, 24);
  const g7 = gumbelBlockProbability(seededTrend, D, 24 * 7);
  const g30 = gumbelBlockProbability(seededTrend, D, 24 * 30);

  const effective = calculateEffectiveHashrate(input.shareSamples ?? [], 300);
  const useHashrate =
    effective.confidence > 0.5 && effective.effectiveHs > 0
      ? effective.effectiveHs
      : h;

  const retarget = predictRetarget(input.recentBlockIntervalsSec ?? [], D);
  const adjustedET =
    retarget.confidence > 0.3 && retarget.predictedDiff > 0
      ? input.expectedYears * (D / retarget.predictedDiff)
      : input.expectedYears;

  const accel = calculateAcceleration(input.hashrateHistory ?? []);
  const reward = calculateDynamicReward(
    input.mempool ?? null,
    input.baseReward ?? 3.125
  );
  const blockDetected = D > 0 && input.bestShare >= D;
  const blockReadiness = blockDetected
    ? 100
    : computeBlockReadiness({
        bestShare: input.bestShare,
        difficulty: D,
        expectedYears: input.expectedYears,
        gumbel24h: g24,
        effective,
        useHashrate,
        accelScore: accel.score,
        retarget,
      });

  return {
    gumbel: {
      pBlock24h: g24.probability,
      pBlock1h: g1.probability,
      pBlock7d: g7.probability,
      pBlock30d: g30.probability,
      trendScore: g24.trendScore,
      mu: g24.mu,
      sigma: g24.sigma,
    },
    effective: {
      hashrateHs: effective.effectiveHs,
      variance: effective.variance,
      confidence: effective.confidence,
      vsAdvertised: h > 0 ? effective.effectiveHs / h : 0,
    },
    retarget: {
      predictedDiff: retarget.predictedDiff,
      changePct: retarget.changePct,
      confidence: retarget.confidence,
      adjustedET,
    },
    acceleration: accel,
    reward,
    blockReadiness,
    blockDetected,
  };
}

/** Persist bestShare samples for EVT (browser only). */
const BEST_KEY = "solopulse:bestShareTrend";

export function pushBestShareSample(bestShare: number, max = 64): BestShareTrend {
  if (typeof window === "undefined" || !(bestShare > 0)) {
    return { timestamps: [], values: [] };
  }
  try {
    const raw = localStorage.getItem(BEST_KEY);
    let trend: BestShareTrend = raw
      ? (JSON.parse(raw) as BestShareTrend)
      : { timestamps: [], values: [] };
    if (!Array.isArray(trend.timestamps) || !Array.isArray(trend.values)) {
      trend = { timestamps: [], values: [] };
    }
    const now = Date.now() / 1000;
    const last = trend.values[trend.values.length - 1];
    if (last != null && Math.abs(last - bestShare) < 1e-12 && trend.timestamps.length) {
      trend.timestamps[trend.timestamps.length - 1] = now;
    } else {
      trend.timestamps.push(now);
      trend.values.push(bestShare);
    }
    if (trend.timestamps.length > max) {
      trend.timestamps = trend.timestamps.slice(-max);
      trend.values = trend.values.slice(-max);
    }
    localStorage.setItem(BEST_KEY, JSON.stringify(trend));
    return trend;
  } catch {
    return { timestamps: [], values: [] };
  }
}

export function loadBestShareTrend(): BestShareTrend {
  if (typeof window === "undefined") return { timestamps: [], values: [] };
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return { timestamps: [], values: [] };
    const j = JSON.parse(raw) as BestShareTrend;
    if (!Array.isArray(j.timestamps) || !Array.isArray(j.values)) {
      return { timestamps: [], values: [] };
    }
    return j;
  } catch {
    return { timestamps: [], values: [] };
  }
}
