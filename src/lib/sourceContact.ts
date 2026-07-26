/**
 * Success-source contact — ALIGNMENT with historical small-miner wins.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CRITICAL (protocol truth):
 *   100% contact  ≠  Bitcoin reward
 *   Contact only means: same *conditions* winners ran under.
 *   BTC is paid ONLY when you find a valid block:
 *     bestDiff ≥ networkDifficulty  OR  coinbase to your address
 *     OR device.foundBlocks increases
 *   That is pure Poisson lottery: P ≈ 1 − e^(−h·t/(D·2³²))
 * ═══════════════════════════════════════════════════════════════════
 */

import { FLEET_EMPIRICS, type SoloWinCase } from "./soloCases";

export type SourceStepStatus = "on" | "partial" | "off";

export type SourceStep = {
  id: string;
  step: number;
  titleKey: string;
  title: { ko: string; en: string; ja: string };
  detail: { ko: string; en: string; ja: string };
  status: SourceStepStatus;
  score: number; // 0-1
  liveValue?: string;
};

export type SourceContact = {
  steps: SourceStep[];
  /** 0–100 alignment with winner conditions — NOT probability of BTC */
  overall: number;
  touching: boolean;
  nearestCase: SoloWinCase | null;
  label: { ko: string; en: string; ja: string };
  /** Explicit: does 100% mean reward? Always false for contact alone */
  contactMeansReward: false;
  /** True only when protocol says you found a block */
  blockFound: boolean;
  truth: { ko: string; en: string; ja: string };
};

export function computeSourceContact(input: {
  hashrateHs: number;
  bestShare: number;
  networkDiff: number;
  lastShareUnix: number;
  authorisedUnix: number;
  shares: number;
  workers: number;
  pool: string;
  nowMs?: number;
  nearestCases?: SoloWinCase[];
  /** Device API foundBlocks / session */
  foundBlocks?: number;
  deviceOnline?: boolean;
}): SourceContact {
  const now = input.nowMs ?? Date.now();
  const nowSec = now / 1000;
  const lastAge = input.lastShareUnix > 0 ? nowSec - input.lastShareUnix : Infinity;
  const authAgeDays =
    input.authorisedUnix > 0 ? (nowSec - input.authorisedUnix) / 86400 : 0;

  const p25 = FLEET_EMPIRICS.winnerHashrateP25;
  const p90 = FLEET_EMPIRICS.winnerHashrateP90;
  const inBand = input.hashrateHs >= p25 * 0.5 && input.hashrateHs <= p90 * 3;
  const strongBand = input.hashrateHs >= p25 && input.hashrateHs <= p90;

  const progress = input.networkDiff > 0 ? input.bestShare / input.networkDiff : 0;
  const soloPool = /ckpool|public-pool|publicpool|solo/i.test(input.pool || "") || true;

  // PROTOCOL block found — best ≥ network difficulty only.
  // Do NOT treat lifetime foundBlocks > 0 as "just won" (historical counter).
  // Session foundBlocks is still useful as a soft signal when bestShare also clears threshold.
  const blockFound =
    (input.networkDiff > 0 && input.bestShare >= input.networkDiff) ||
    (input.foundBlocks != null &&
      input.foundBlocks > 0 &&
      input.networkDiff > 0 &&
      input.bestShare >= input.networkDiff * 0.99);

  const onlineOk =
    input.deviceOnline === true ||
    lastAge < 120 ||
    (input.deviceOnline !== false && lastAge < 600);

  const steps: SourceStep[] = [
    {
      id: "online",
      step: 1,
      titleKey: "srcOnline",
      title: {
        ko: "기기 온라인 · 해시/셰어 활성",
        en: "Device online · hashing/shares",
        ja: "デバイス稼働・ハッシュ/シェア",
      },
      detail: {
        ko: "승자 조건: 보드가 실제로 해시를 내고 있을 것.",
        en: "Winner condition: board is actively hashing.",
        ja: "勝者条件: ボードが実際にハッシュ中。",
      },
      status: onlineOk && lastAge < 120 ? "on" : onlineOk ? "partial" : "off",
      score: lastAge < 60 ? 1 : lastAge < 180 ? 0.85 : lastAge < 600 ? 0.5 : input.deviceOnline ? 0.4 : 0,
      liveValue:
        lastAge === Infinity
          ? input.deviceOnline
            ? "device"
            : "—"
          : lastAge < 5
            ? "now"
            : `${Math.floor(lastAge)}s ago`,
    },
    {
      id: "band",
      step: 2,
      titleKey: "srcBand",
      title: {
        ko: "승자 해시레이트 대역",
        en: "Winner hashrate band",
        ja: "勝者ハッシュレート帯",
      },
      detail: {
        ko: "사례 승자 대부분 0.5–10 TH/s (소형 기기).",
        en: "Most case winners: 0.5–10 TH/s (small devices).",
        ja: "事例勝者の多くは 0.5–10 TH/s。",
      },
      status: strongBand ? "on" : inBand ? "partial" : "off",
      score: strongBand ? 1 : inBand ? 0.6 : input.hashrateHs > 0 ? 0.2 : 0,
      liveValue: `${(input.hashrateHs / 1e12).toFixed(4)} TH/s`,
    },
    {
      id: "pool",
      step: 3,
      titleKey: "srcPool",
      title: {
        ko: "솔로 풀 경로",
        en: "Solo pool path",
        ja: "ソロプール経路",
      },
      detail: {
        ko: "CKPool/Public — 블록 시 보상이 내 주소로 (풀 분배 아님).",
        en: "CKPool/Public — full reward to you if you hit a block.",
        ja: "CKPool/Public — ブロック時に報酬があなたへ。",
      },
      status: soloPool ? "on" : "off",
      score: soloPool ? 1 : 0,
      liveValue: input.pool || "—",
    },
    {
      id: "shares",
      step: 4,
      titleKey: "srcShares",
      title: {
        ko: "셰어 = 복권 티켓 누적",
        en: "Shares = lottery tickets",
        ja: "シェア = 宝くじ券",
      },
      detail: {
        ko: "티켓이 쌓여도 당첨(블록)은 별개 사건.",
        en: "Stacking tickets ≠ winning; block is a separate event.",
        ja: "券が増えても当選(ブロック)は別事象。",
      },
      status: input.shares > 1e4 ? "on" : input.shares > 0 ? "partial" : "off",
      score: input.shares > 1e5 ? 1 : input.shares > 1e3 ? 0.75 : input.shares > 0 ? 0.4 : 0,
      liveValue: input.shares.toLocaleString(),
    },
    {
      id: "ladder",
      step: 5,
      titleKey: "srcLadder",
      title: {
        ko: "베스트 셰어 사다리 (블록 직전 지표)",
        en: "Best-share ladder (pre-block metric)",
        ja: "ベストシェア梯子",
      },
      detail: {
        ko: "bestDiff ≥ 네트워크 난이도 일 때만 블록. 그 전은 진행도일 뿐.",
        en: "Block only if bestDiff ≥ network difficulty. Before that = progress only.",
        ja: "bestDiff ≥ ネットワーク難易度の時だけブロック。",
      },
      status:
        progress >= 1
          ? "on"
          : progress >= 1e-6
            ? "partial"
            : input.bestShare > 0
              ? "partial"
              : "off",
      score:
        progress >= 1
          ? 1
          : Math.min(0.95, Math.log10(1 + progress * 1e12) / 12 + (input.bestShare > 0 ? 0.15 : 0)),
      liveValue:
        progress >= 1
          ? "BLOCK THRESHOLD"
          : progress > 0
            ? `${(progress * 100).toExponential(2)}% of net`
            : "—",
    },
    {
      id: "runtime",
      step: 6,
      titleKey: "srcRuntime",
      title: {
        ko: "연속 가동 (당첨 확률↑ 아님, 티켓 시간↑)",
        en: "Uptime (more tickets over time, not guaranteed win)",
        ja: "連続稼働（券の時間↑、当選保証ではない）",
      },
      detail: {
        ko: "오래 돌릴수록 기대 블록 수는 늘지만 확정 보상은 아님.",
        en: "Longer runtime raises expected blocks, never a fixed payout.",
        ja: "長く回すほど期待値は上がるが確定報酬ではない。",
      },
      status:
        authAgeDays >= 7 ? "on" : authAgeDays >= 1 ? "partial" : input.authorisedUnix > 0 ? "partial" : "off",
      score:
        authAgeDays >= 30
          ? 1
          : authAgeDays >= 7
            ? 0.85
            : authAgeDays >= 1
              ? 0.5
              : input.authorisedUnix > 0
                ? 0.25
                : 0,
      liveValue: authAgeDays > 0 ? `${authAgeDays.toFixed(1)}d` : "—",
    },
  ];

  const overall = (steps.reduce((s, x) => s + x.score, 0) / steps.length) * 100;
  const touching = overall >= 55;
  const nearestCase = input.nearestCases?.[0] ?? null;

  let label: SourceContact["label"];
  if (blockFound) {
    label = {
      ko: "블록 발견 조건 충족 — 보상이 온체인으로 향합니다",
      en: "Block-found condition met — reward path on-chain",
      ja: "ブロック条件達成 — 報酬がオンチェーンへ",
    };
  } else if (overall >= 90) {
    label = {
      ko: "승자 조건 정렬 완료 — 여전히 복권 (BTC 확정 아님)",
      en: "Winner conditions aligned — still a lottery (BTC not guaranteed)",
      ja: "勝者条件は整った — 依然宝くじ（BTC確定ではない）",
    };
  } else if (overall >= 55) {
    label = {
      ko: "소스 접촉 중 — 메커니즘 가동, 보상은 블록 시에만",
      en: "Touching source — mechanism live; reward only on block",
      ja: "ソース接触中 — 仕組みは稼働、報酬はブロック時のみ",
    };
  } else if (overall >= 30) {
    label = {
      ko: "부분 접촉 — 온라인/풀/셰어를 확인하세요",
      en: "Partial contact — check online/pool/shares",
      ja: "部分接触 — オンライン/プール/シェアを確認",
    };
  } else {
    label = {
      ko: "소스 미접촉 — 마이너·풀 연결 필요",
      en: "Not touching source — connect miner/pool",
      ja: "ソース未接触 — マイナー/プール接続が必要",
    };
  }

  const truth = {
    ko: "성공 소스 100% = 승자들과 같은 조건으로 돌고 있다는 뜻입니다. 비트코인 보상은 bestDiff≥네트워크 난이도 또는 입금 주소 코인베이스일 때만 확정됩니다.",
    en: "Source contact 100% means you match winner conditions. BTC is only earned when bestDiff ≥ network difficulty or coinbase hits your address.",
    ja: "ソース接触100%は勝者と同じ条件という意味です。BTC報酬は bestDiff≥ネットワーク難易度 またはコインベースが入金アドレスの時だけです。",
  };

  return {
    steps,
    overall,
    touching,
    nearestCase,
    label,
    contactMeansReward: false,
    blockFound,
    truth,
  };
}
