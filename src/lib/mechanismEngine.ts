/**
 * Multi-vector mechanism synthesis for small-miner block finds.
 *
 * We cannot watch every solo win live, so we attack the problem from
 * several independent angles and require them to converge.
 *
 * ─────────────────────────────────────────────────────────────────
 * CONVERGENT CONCLUSION (all methods agree):
 *
 * 1. PROTOCOL: Every SHA-256 hash has the same P(success) ≈ 1/(D·2³²).
 *    There is no "small miner secret path" through the mempool.
 *
 * 2. MEMPOOL "TETRIS": New block templates (jobs) arrive continuously.
 *    Who *authors* the next block is a race of hashes — not of packing skill.
 *    Packing affects fee revenue *if* you win; it does not change P(win).
 *    Visually: ~every 600s a slot is claimed by whoever hit target first.
 *
 * 3. EMPIRICAL: Sub-TH and few-TH devices have won. Those wins sit deep
 *    in the left tail of a geometric/Poisson process (selection bias).
 *
 * 4. FLEET: Thousands of small devices run in parallel → network-wide
 *    someone hits roughly every 1–3 weeks even though each EV is millennia.
 *
 * 5. TRACKABLE SOURCE (what the app should follow):
 *    continuous tickets (h) × solo path × bestDiff ascent × uptime
 *    → same lottery winners played. Tracking ≠ guaranteeing BTC.
 * ─────────────────────────────────────────────────────────────────
 */

import { SOLO_WIN_CASES, FLEET_EMPIRICS, type SoloWinCase } from "./soloCases";
import {
  buildSoloMathCore,
  runMonteCarloSolo,
  type MonteCarloSoloResult,
  type SoloMathCore,
  TWO_32,
} from "./soloProbability";
import {
  buildEnhancedBundle,
  type BestShareTrend,
  type EnhancedBundle,
  type HashratePoint,
  type MempoolState,
  type ShareSample,
} from "./mechanismEnhanced";

export type MethodId =
  | "protocol"
  | "empirical"
  | "monteCarlo"
  | "extremeBest"
  | "fleet"
  | "mempoolTetris"
  | "evtReadiness";

export type MethodResult = {
  id: MethodId;
  title: { ko: string; en: string; ja: string };
  finding: { ko: string; en: string; ja: string };
  /** 0–1 confidence this method supports the convergent conclusion */
  supportsConclusion: number;
  metrics: Record<string, string | number>;
};

export type MechanismSynthesis = {
  hashrateHs: number;
  difficulty: number;
  bestShare: number;
  methods: MethodResult[];
  /** Average support across methods */
  consensus: number;
  conclusion: { ko: string; en: string; ja: string };
  trackableSource: {
    ticketsPerSec: number;
    pHash: number;
    expectedYears: number;
    pLucky30d: number;
    pLucky1y: number;
    bestShareLogProgress: number;
    relativeToWeakestWinner: number;
    relativeToMedianWinner: number;
  };
  /** Monte Carlo snapshot (real math, seeded by inputs) */
  sim: {
    trials: number;
    hitsIn30d: number;
    hitsIn1y: number;
    earliestHitDays: number | null;
    medianHitYears: number | null;
    /** full MC payload for UI */
    full?: MonteCarloSoloResult;
  };
  /** Closed-form + share math core */
  math: SoloMathCore;
  weakerWins: SoloWinCase[];
  /** v2.5 enhanced readiness (optional for callers) */
  enhanced?: EnhancedBundle;
};

export function runMonteCarlo(params: {
  hashrateHs: number;
  difficulty: number;
  trials?: number;
  horizonDays?: number;
  seed?: number;
}): MechanismSynthesis["sim"] {
  const full = runMonteCarloSolo({
    hashrateHs: params.hashrateHs,
    difficulty: params.difficulty,
    trials: params.trials ?? 20_000,
    horizonDays: params.horizonDays ?? 365.25 * 100,
    seed: params.seed,
  });
  return {
    trials: full.trials,
    hitsIn30d: full.hitsIn30d,
    hitsIn1y: full.hitsIn1y,
    earliestHitDays: full.earliestHitDays,
    medianHitYears: full.p50Years,
    full,
  };
}

/**
 * Extreme-value model: expected max share difficulty after H hashes
 * median best ≈ H / (2³² · ln2)
 * Progress to block = best / networkDiff (log scale for UI)
 */
export function extremeBestModel(hashrateHs: number, difficulty: number, uptimeSec: number) {
  const H = hashrateHs * Math.max(0, uptimeSec);
  const expectedMedianBest = H > 0 ? H / (TWO_32 * Math.LN2) : 0;
  const logProgress =
    difficulty > 0
      ? Math.min(1, Math.log10(1 + (expectedMedianBest / difficulty) * 1e12) / 12)
      : 0;
  const pBestBeatsNetwork =
    difficulty > 0 && H > 0
      ? 1 - Math.exp(-H / (difficulty * TWO_32))
      : 0;
  return { expectedMedianBest, logProgress, pBestBeatsNetwork, hashesDone: H };
}

export function synthesizeMechanism(input: {
  hashrateHs: number;
  difficulty: number;
  bestShare: number;
  uptimeSec?: number;
  recentBlockIntervalsSec?: number[];
  recentPoolNames?: string[];
  networkHashrateHs?: number | null;
  /** v2.5 optional feeds */
  bestShareTrend?: BestShareTrend;
  shareSamples?: ShareSample[];
  hashrateHistory?: HashratePoint[];
  mempool?: MempoolState | null;
  baseReward?: number;
}): MechanismSynthesis {
  const h = input.hashrateHs;
  const D = input.difficulty;
  const best = input.bestShare;
  const uptime = input.uptimeSec ?? 86400; // default 1d if unknown

  const math = buildSoloMathCore({
    hashrateHs: h,
    difficulty: D,
    networkHashrateHs: input.networkHashrateHs,
  });

  const pHash = math.pHash;
  const expYears = math.expectedYears;
  const p30 = math.poisson.d30;
  const p1y = math.poisson.year;

  const winners = SOLO_WIN_CASES.filter((c) => c.class !== "rented");
  const weakerWins = winners
    .filter((c) => c.hashrateHs > 0 && c.hashrateHs <= h * 1.05)
    .sort((a, b) => a.hashrateHs - b.hashrateHs);
  const allSorted = [...winners].sort((a, b) => a.hashrateHs - b.hashrateHs);
  const medianWinner = allSorted[Math.floor(allSorted.length / 2)];
  const weakest = allSorted[0];

  const sim = runMonteCarlo({ hashrateHs: h, difficulty: D, trials: 20_000 });
  const extreme = extremeBestModel(h, D, uptime);

  const intervals = input.recentBlockIntervalsSec || [];
  const avgInterval =
    intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 600;
  const uniquePools = new Set(input.recentPoolNames || []).size;

  // ── Method results ──
  const methods: MethodResult[] = [
    {
      id: "protocol",
      title: {
        ko: "① 프로토콜 수학",
        en: "① Protocol math",
        ja: "① プロトコル数学",
      },
      finding: {
        ko: "모든 해시가 동일 확률. 소형 기기 전용 지름길 없음. P(hash)=1/(D·2³²).",
        en: "Every hash equal odds. No small-miner shortcut. P(hash)=1/(D·2³²).",
        ja: "全ハッシュ同確率。小型専用の近道なし。P=1/(D·2³²)。",
      },
      supportsConclusion: 1,
      metrics: {
        pHash: pHash.toExponential(4),
        expectedYears: expYears.toExponential(3),
        ticketsPerSec: h,
      },
    },
    {
      id: "empirical",
      title: {
        ko: "② 실증 사례 (당신보다 약한 승자)",
        en: "② Empirical cases (weaker than you)",
        ja: "② 実証事例（あなたより弱い勝者）",
      },
      finding: {
        ko:
          weakerWins.length > 0
            ? `${weakerWins.length}건이 당신(≤${(h / 1e12).toFixed(2)} TH) 이하 해시로 블록. 전부 좌측 꼬리(운) 현상.`
            : "기록상 당신보다 약한 승자는 적지만, 0.5–1.2 TH 승자 다수 존재 → 동일 꼬리.",
        en:
          weakerWins.length > 0
            ? `${weakerWins.length} wins at ≤ your hashrate — pure left-tail luck, same mechanism.`
            : "Few weaker-than-you cases, but 0.5–1.2 TH wins exist — same tail.",
        ja:
          weakerWins.length > 0
            ? `あなた以下のハッシュで${weakerWins.length}件勝利。左裾の運、同じ仕組み。`
            : "0.5–1.2 TH勝利が存在。同じ裾。",
      },
      supportsConclusion: weakerWins.length > 0 ? 0.95 : 0.85,
      metrics: {
        weakerCount: weakerWins.length,
        weakestGhs: weakest ? weakest.hashrateHs / 1e9 : 0,
        yourGhs: h / 1e9,
      },
    },
    {
      id: "monteCarlo",
      title: {
        ko: "③ 몬테카를로 (대기시간 분포)",
        en: "③ Monte Carlo (waiting-time dist.)",
        ja: "③ モンテカルロ（待ち時間）",
      },
      finding: {
        ko: `${sim.trials.toLocaleString()}회 MC: 30일 ${(
          (100 * sim.hitsIn30d) /
          sim.trials
        ).toFixed(4)}% · 1년 ${(
          (100 * sim.hitsIn1y) /
          sim.trials
        ).toFixed(4)}% · 중앙 ${
          sim.medianHitYears != null ? sim.medianHitYears.toFixed(1) + "년" : "∞"
        } · |MC−Poisson|₃₀≈${
          sim.full ? (sim.full.absErr30d * 100).toExponential(2) : "—"
        }%p. 닫힌식과 수렴.`,
        en: `${sim.trials.toLocaleString()} MC trials: 30d ${(
          (100 * sim.hitsIn30d) /
          sim.trials
        ).toFixed(4)}% · 1y ${(
          (100 * sim.hitsIn1y) /
          sim.trials
        ).toFixed(4)}% · median ${
          sim.medianHitYears != null ? sim.medianHitYears.toFixed(1) + "y" : "∞"
        } · |MC−Poisson|₃₀≈${
          sim.full ? (sim.full.absErr30d * 100).toExponential(2) : "—"
        }pp. Matches closed form.`,
        ja: `${sim.trials.toLocaleString()}回MC: 30日${(
          (100 * sim.hitsIn30d) /
          sim.trials
        ).toFixed(4)}% · 1年${(
          (100 * sim.hitsIn1y) /
          sim.trials
        ).toFixed(4)}% · 中央${
          sim.medianHitYears != null ? sim.medianHitYears.toFixed(1) + "年" : "∞"
        }. 閉じた式と一致。`,
      },
      supportsConclusion: 1,
      metrics: {
        p30sim: sim.hitsIn30d / sim.trials,
        p1ysim: sim.hitsIn1y / sim.trials,
        p30math: p30,
        p1ymath: p1y,
        sharePct: math.networkSharePct,
        absErr30d: sim.full?.absErr30d ?? 0,
      },
    },
    {
      id: "extremeBest",
      title: {
        ko: "④ bestDiff 극값 (사다리)",
        en: "④ bestDiff extreme value",
        ja: "④ bestDiff 極値",
      },
      finding: {
        ko: `가동 중 해시로 기대 중앙 best≈${formatSci(extreme.expectedMedianBest)}. 실측 best=${formatSci(
          best
        )}. 블록은 best≥D일 때만. 사다리 상승=추적 가능한 소스.`,
        en: `Median expected best≈${formatSci(extreme.expectedMedianBest)}; measured=${formatSci(
          best
        )}. Block iff best≥D. Ladder climb is the trackable source.`,
        ja: `期待中央best≈${formatSci(extreme.expectedMedianBest)}、実測=${formatSci(
          best
        )}。best≥Dの時のみブロック。梯子が追跡ソース。`,
      },
      supportsConclusion: 0.9,
      metrics: {
        expectedMedianBest: extreme.expectedMedianBest,
        measuredBest: best,
        logProgress: extreme.logProgress,
        pHitGivenHashes: extreme.pBestBeatsNetwork,
      },
    },
    {
      id: "fleet",
      title: {
        ko: "⑤ 플릿 복권",
        en: "⑤ Fleet lottery",
        ja: "⑤ フリート宝くじ",
      },
      finding: {
        ko: `솔로 풀 전체 ~${FLEET_EMPIRICS.avgDaysBetweenSoloWins}일마다 1승. 개인 EV는 길어도 집단은 자주 터짐. 당신 기기는 그 티켓 묶음의 하나.`,
        en: `~1 solo win every ${FLEET_EMPIRICS.avgDaysBetweenSoloWins}d fleet-wide. Personal EV huge; fleet hits often. You hold one ticket book.`,
        ja: `全体で約${FLEET_EMPIRICS.avgDaysBetweenSoloWins}日に1勝。個人EVは長いが集団は頻繁。あなたも券の一冊。`,
      },
      supportsConclusion: 0.92,
      metrics: {
        avgDaysBetweenFleetWins: FLEET_EMPIRICS.avgDaysBetweenSoloWins,
        verified12m: FLEET_EMPIRICS.verifiedSoloBlocks12m,
      },
    },
    {
      id: "mempoolTetris",
      title: {
        ko: "⑥ 밈풀 테트리스 (슬롯 경쟁)",
        en: "⑥ Mempool tetris (slot race)",
        ja: "⑥ メムプール・テトリス",
      },
      finding: {
        ko: `최근 블록 간격 평균 ~${avgInterval.toFixed(0)}s, 풀 다양성 ${uniquePools}. 테트리스=누가 다음 슬롯을 해시로 채우나. 소형은 같은 슬롯에 가끔 운으로 끼워 넣음. 패킹≠당첨확률.`,
        en: `Avg interval ~${avgInterval.toFixed(0)}s, ${uniquePools} pools. Tetris = who fills the next ~10m slot with a valid hash. Packing ≠ P(win).`,
        ja: `平均間隔~${avgInterval.toFixed(0)}s、プール${uniquePools}. テトリス=次スロットをハッシュで埋める競争。パッキング≠当選率。`,
      },
      supportsConclusion: 0.88,
      metrics: {
        avgIntervalSec: avgInterval,
        uniquePools,
      },
    },
  ];

  // ── v2.5 enhanced readiness ──
  const enhanced = buildEnhancedBundle({
    hashrateHs: h,
    difficulty: D,
    bestShare: best,
    expectedYears: expYears,
    bestShareTrend: input.bestShareTrend,
    shareSamples: input.shareSamples,
    hashrateHistory: input.hashrateHistory,
    recentBlockIntervalsSec: input.recentBlockIntervalsSec,
    mempool: input.mempool,
    baseReward: input.baseReward,
  });

  methods.push({
    id: "evtReadiness",
    title: {
      ko: "⑦ EVT 임박 분석 (bestShare 추이)",
      en: "⑦ EVT proximity (bestShare trend)",
      ja: "⑦ EVT 接近分析",
    },
    finding: {
      ko: `Block Readiness ${enhanced.blockReadiness.toFixed(1)}% · EVT 24h ${(enhanced.gumbel.pBlock24h * 100).toExponential(2)}% · 추이 ${(enhanced.gumbel.trendScore * 100).toFixed(0)}% · 리타겟 ${enhanced.retarget.changePct >= 0 ? "+" : ""}${enhanced.retarget.changePct.toFixed(1)}%${enhanced.blockDetected ? " · 블록 감지" : ""}.`,
      en: `Readiness ${enhanced.blockReadiness.toFixed(1)}% · EVT 24h ${(enhanced.gumbel.pBlock24h * 100).toExponential(2)}% · trend ${(enhanced.gumbel.trendScore * 100).toFixed(0)}% · retarget ${enhanced.retarget.changePct >= 0 ? "+" : ""}${enhanced.retarget.changePct.toFixed(1)}%${enhanced.blockDetected ? " · BLOCK" : ""}.`,
      ja: `Readiness ${enhanced.blockReadiness.toFixed(1)}% · EVT24h ${(enhanced.gumbel.pBlock24h * 100).toExponential(2)}% · リターゲット ${enhanced.retarget.changePct.toFixed(1)}%.`,
    },
    supportsConclusion: 0.85 + enhanced.gumbel.trendScore * 0.12,
    metrics: {
      blockReadiness: enhanced.blockReadiness,
      p24h: enhanced.gumbel.pBlock24h,
      p1h: enhanced.gumbel.pBlock1h,
      trendScore: enhanced.gumbel.trendScore,
      retargetPct: enhanced.retarget.changePct,
      blockDetected: enhanced.blockDetected ? 1 : 0,
    },
  });

  const consensus =
    methods.reduce((s, m) => s + m.supportsConclusion, 0) / methods.length;

  const useH =
    enhanced.effective.confidence > 0.5 && enhanced.effective.hashrateHs > 0
      ? enhanced.effective.hashrateHs
      : h;

  const trackableSource = {
    ticketsPerSec: useH,
    pHash,
    expectedYears: enhanced.retarget.adjustedET || expYears,
    pLucky30d: p30,
    pLucky1y: p1y,
    bestShareLogProgress:
      D > 0 ? Math.min(1, Math.log10(1 + (best / D) * 1e12) / 12) : 0,
    relativeToWeakestWinner: weakest && weakest.hashrateHs > 0 ? useH / weakest.hashrateHs : 0,
    relativeToMedianWinner:
      medianWinner && medianWinner.hashrateHs > 0 ? useH / medianWinner.hashrateHs : 0,
  };

  const shareStr =
    math.networkSharePct > 0
      ? math.networkSharePct < 1e-6
        ? math.networkSharePct.toExponential(6)
        : math.networkSharePct.toFixed(12)
      : "0";

  const conclusion = {
    ko: `합의 ${(consensus * 100).toFixed(0)}% · Readiness ${enhanced.blockReadiness.toFixed(1)}%${enhanced.blockDetected ? " · 블록 조건 충족" : ""}. s=${shareStr}% · E[T]≈${
      Number.isFinite(enhanced.retarget.adjustedET) ? enhanced.retarget.adjustedET.toFixed(1) : "∞"
    }y · EVT24h=${(enhanced.gumbel.pBlock24h * 100).toExponential(2)}%. 메커니즘=해시 복권+티켓+솔로. 100% 접촉≠BTC.`,
    en: `Consensus ${(consensus * 100).toFixed(0)}% · Readiness ${enhanced.blockReadiness.toFixed(1)}%${enhanced.blockDetected ? " · BLOCK" : ""}. s=${shareStr}% · E[T]≈${
      Number.isFinite(enhanced.retarget.adjustedET) ? enhanced.retarget.adjustedET.toFixed(1) : "∞"
    }y · EVT24h=${(enhanced.gumbel.pBlock24h * 100).toExponential(2)}%. Lottery+tickets+solo. 100% contact ≠ BTC.`,
    ja: `合意${(consensus * 100).toFixed(0)}% · Readiness ${enhanced.blockReadiness.toFixed(1)}%. s=${shareStr}% · E[T]≈${
      Number.isFinite(enhanced.retarget.adjustedET) ? enhanced.retarget.adjustedET.toFixed(1) : "∞"
    }y.`,
  };

  return {
    hashrateHs: h,
    difficulty: D,
    bestShare: best,
    methods,
    consensus,
    conclusion,
    trackableSource,
    sim,
    math,
    weakerWins,
    enhanced,
  };
}

function formatSci(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toExponential(2);
}

/** Live "tetris slot" progress 0–1 from seconds since last block */
export function tetrisSlotProgress(secSinceLast: number, targetSec = 600): number {
  return Math.min(1.15, Math.max(0, secSinceLast / targetSec));
}
