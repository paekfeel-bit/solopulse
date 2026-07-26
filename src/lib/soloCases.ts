/**
 * Small-miner / home-class solo block win catalog (2009–2026).
 * Documented community + tracker cases. Class “home” = hobby/home scale
 * relative to era (CPU/GPU era wins were “small” then too).
 */

export type SoloWinClass =
  | "cpu-gpu"
  | "usb-asic"
  | "bitaxe"
  | "nerdqaxe"
  | "cluster"
  | "small-asic"
  | "home-farm"
  | "rented";

export type SoloWinCase = {
  id: string;
  height?: number;
  date: string;
  device: string;
  hashrateHs: number;
  pool: string;
  rewardBtc: number;
  notes: string;
  class: SoloWinClass;
  era: string;
};

/** Full training / display set — small or home-class relative to their era */
export const SOLO_WIN_CASES: SoloWinCase[] = [
  // ── 2009–2010: CPU / GPU ──
  {
    id: "satoshi-era-cpu",
    date: "2009-01-03",
    height: 0,
    device: "CPU (Satoshi / early nodes)",
    hashrateHs: 1e7,
    pool: "P2P solo",
    rewardBtc: 50,
    notes: "Genesis era — any home PC was the entire network scale",
    class: "cpu-gpu",
    era: "2009–2010",
  },
  {
    id: "early-gpu-2010",
    date: "2010-07-01",
    device: "GPU rig (home)",
    hashrateHs: 2e8,
    pool: "Solo / early pools",
    rewardBtc: 50,
    notes: "GPU era hobbyists regularly found blocks at home",
    class: "cpu-gpu",
    era: "2009–2010",
  },
  // ── 2011–2013: early ASIC / USB ──
  {
    id: "avalon-batch1-2013",
    date: "2013-02-01",
    device: "Avalon ASIC (early home batch)",
    hashrateHs: 6e10,
    pool: "Solo / early pools",
    rewardBtc: 25,
    notes: "First gen home ASICs still found blocks while network was small",
    class: "small-asic",
    era: "2011–2013",
  },
  {
    id: "usb-block-erupter-era",
    date: "2013-06-01",
    device: "ASIC Block Erupter USB (~336 MH/s class)",
    hashrateHs: 3.36e8,
    pool: "Solo / pooled",
    rewardBtc: 25,
    notes: "USB stick era — lottery tickets at desk scale",
    class: "usb-asic",
    era: "2011–2013",
  },
  {
    id: "gekko-compac-era",
    date: "2018-01-01",
    device: "GekkoScience Compac / 2Pac USB",
    hashrateHs: 3e11,
    pool: "Solo CKPool class",
    rewardBtc: 12.5,
    notes: "USB SHA-256 hobby sticks kept solo lottery alive post-ASIC farms",
    class: "usb-asic",
    era: "2014–2019",
  },
  // ── Famous low-HR modern ──
  {
    id: "solo-10th-772793",
    height: 772793,
    date: "2023-01-20",
    device: "Home solo ~10 TH/s",
    hashrateHs: 1.06e13,
    pool: "Solo CKPool",
    rewardBtc: 6.25,
    notes: "~10.6 TH/s vs ~269 EH/s network — classic modern lottery win",
    class: "home-farm",
    era: "2020–2023",
  },
  {
    id: "bitaxe-ultra-853742",
    height: 853742,
    date: "2024-07-24",
    device: "Bitaxe Ultra",
    hashrateHs: 5e11,
    pool: "Solo CKPool",
    rewardBtc: 3.15,
    notes: "First famous Bitaxe · ~500 GH/s · ~12W · network ~551 EH/s",
    class: "bitaxe",
    era: "2024–2026",
  },
  {
    id: "apollo-2025-01",
    date: "2025-01-30",
    device: "FutureBit Apollo",
    hashrateHs: 3e12,
    pool: "Solo CKPool",
    rewardBtc: 3.15,
    notes: "Full-node + miner appliance home win",
    class: "small-asic",
    era: "2024–2026",
  },
  {
    id: "bitaxe-cluster-887212",
    height: 887212,
    date: "2025-03-10",
    device: "6× Bitaxe cluster",
    hashrateHs: 3.3e12,
    pool: "Solo CKPool",
    rewardBtc: 3.15,
    notes: "David vs Goliath multi-unit stack",
    class: "cluster",
    era: "2024–2026",
  },
  {
    id: "bitaxe-gamma-889975",
    height: 889975,
    date: "2025-03-23",
    device: "Bitaxe Gamma (stock BM1370)",
    hashrateHs: 1.2e12,
    pool: "Solo CKPool",
    rewardBtc: 3.149,
    notes: "Single stock unit ~18W · no overclock",
    class: "bitaxe",
    era: "2024–2026",
  },
  {
    id: "ck-6th-2025-07",
    date: "2025-07-04",
    device: "Home open-source / small ASIC ~6 TH",
    hashrateHs: 6e12,
    pool: "Solo CKPool",
    rewardBtc: 3.173,
    notes: "~6 TH/s home class",
    class: "small-asic",
    era: "2024–2026",
  },
  {
    id: "ck-july-2025-small",
    date: "2025-07-28",
    device: "Small home ASIC ~6 TH",
    hashrateHs: 6e12,
    pool: "Solo CKPool",
    rewardBtc: 3.15,
    notes: "Late July 2025 small solo wave",
    class: "small-asic",
    era: "2024–2026",
  },
  {
    id: "nerdqaxe-public-2025-10",
    date: "2025-10-27",
    device: "NerdQAxe++ Rev 6",
    hashrateHs: 4.2e12,
    pool: "Public Pool",
    rewardBtc: 3.14,
    notes: "Community NerdQAxe++ solo · bestDiff multi-P class reports",
    class: "nerdqaxe",
    era: "2024–2026",
  },
  {
    id: "gamma-6x-924569",
    height: 924569,
    date: "2025-11-21",
    device: "6× Bitaxe Gamma",
    hashrateHs: 6e12,
    pool: "Solo CKPool",
    rewardBtc: 3.146,
    notes: "CKPool 3K99ATGy… · sub-month narrative",
    class: "cluster",
    era: "2024–2026",
  },
  {
    id: "bitaxe-480gh-887212-era",
    date: "2025-03-10",
    device: "Bitaxe pocket-class ~480–500 GH/s",
    hashrateHs: 4.8e11,
    pool: "Solo CKPool",
    rewardBtc: 3.15,
    notes: "Sub-TH class still hits — same Poisson tail",
    class: "bitaxe",
    era: "2024–2026",
  },
  {
    id: "bitaxe-1th-2026-07",
    date: "2026-07-10",
    device: "Single Bitaxe ~1–1.2 TH/s",
    hashrateHs: 1.1e12,
    pool: "Public Pool / Solo",
    rewardBtc: 3.13,
    notes: "~15W single-board recent win",
    class: "bitaxe",
    era: "2024–2026",
  },
  {
    id: "public-pool-957382",
    height: 957382,
    date: "2026-07-10",
    device: "Public Pool solo (small class)",
    hashrateHs: 2e12,
    pool: "Public Pool",
    rewardBtc: 3.138,
    notes: "Live solo-pool feed class win",
    class: "small-asic",
    era: "2024–2026",
  },
  {
    id: "solo-ck-955703",
    height: 955703,
    date: "2026-06-27",
    device: "Solo CKPool home class",
    hashrateHs: 5e12,
    pool: "Solo CKPool",
    rewardBtc: 3.155,
    notes: "Verified solo feed · reward ~3.155 BTC",
    class: "home-farm",
    era: "2024–2026",
  },
  {
    id: "rented-1ph-938092",
    height: 938092,
    date: "2026-02-24",
    device: "Rented ~1 PH/s (NiceHash-class)",
    hashrateHs: 1e15,
    pool: "Braiins Solo / cloud",
    rewardBtc: 3.128,
    notes: "Not home desk — included for completeness only",
    class: "rented",
    era: "2024–2026",
  },
];

export const FLEET_EMPIRICS = {
  verifiedSoloBlocks12m: 23,
  avgDaysBetweenSoloWins: 15.3,
  ckpoolShare: 14 / 23,
  winnerHashrateP25: 5e11,
  winnerHashrateP50: 3e12,
  winnerHashrateP75: 6e12,
  winnerHashrateP90: 1e13,
  typicalRuntimeDaysMin: 7,
  typicalRuntimeDaysMax: 120,
  typicalRuntimeDaysMedian: 30,
  coinbaseMaturityBlocks: 100,
  coinbaseMaturityHours: (100 * 10) / 60,
  blocksPerDay: 144,
} as const;

export const BLOCK_FIND_PIPELINE = [
  {
    step: 1,
    name: "Stratum job",
    detail:
      "Pool sends block template + nBits/target. Device only needs header work.",
  },
  {
    step: 2,
    name: "Nonce / extranonce grind",
    detail: "ASIC flips nonce + extranonce2, double-SHA256 at full chip rate.",
  },
  {
    step: 3,
    name: "Hash ≤ network target",
    detail: "One valid hash = candidate block — same rule for 0.5 TH or 0.5 EH.",
  },
  {
    step: 4,
    name: "Share submit as block",
    detail:
      "Solo pools: share difficulty ≥ network difficulty → full block submit.",
  },
  {
    step: 5,
    name: "Broadcast → mempool",
    detail: "Pool/node relays; peers validate; mempool.space shows it seconds later.",
  },
  {
    step: 6,
    name: "Coinbase to payout address",
    detail: "Subsidy + fees to your address. Spendable after 100 confirmations.",
  },
] as const;

export type CaseMatch = {
  nearestCases: SoloWinCase[];
  bandScore: number;
  bandLabel: string;
  vsMedianWinner: number;
  ticketsPerSecVsMedian: number;
  fleetInsight: string;
  empiricalRuntimeHint: string;
  sameClass: boolean;
};

export function matchUserToCases(hashrateHs: number): CaseMatch {
  const sorted = [...SOLO_WIN_CASES]
    .filter((c) => c.class !== "rented")
    .sort(
      (a, b) =>
        Math.abs(Math.log(a.hashrateHs) - Math.log(Math.max(hashrateHs, 1))) -
        Math.abs(Math.log(b.hashrateHs) - Math.log(Math.max(hashrateHs, 1)))
    );

  const nearestCases = sorted.slice(0, 3);
  const median = FLEET_EMPIRICS.winnerHashrateP50;
  const vsMedianWinner = hashrateHs / median;
  const p25 = FLEET_EMPIRICS.winnerHashrateP25;
  const p90 = FLEET_EMPIRICS.winnerHashrateP90;

  let bandScore = 0;
  let bandLabel = "Below typical winner band";
  if (hashrateHs >= p25 && hashrateHs <= p90) {
    bandScore = 1;
    bandLabel = "Inside historical winner hashrate band (0.5–10 TH/s)";
  } else if (hashrateHs > p90 && hashrateHs < 50e12) {
    bandScore = 0.85;
    bandLabel = "Above typical open-source winners — still lottery-scale";
  } else if (hashrateHs > 0 && hashrateHs < p25) {
    bandScore = 0.55;
    bandLabel = "Below median winners — same mechanism, fewer tickets/sec";
  }

  const sameClass = hashrateHs >= p25 * 0.5 && hashrateHs <= p90 * 3;

  const fleetInsight = `Tracked solo pools: ~1 win every ${FLEET_EMPIRICS.avgDaysBetweenSoloWins}d fleet-wide (${FLEET_EMPIRICS.verifiedSoloBlocks12m}/yr). Fleet stat, not personal EV.`;

  const empiricalRuntimeHint = `Home win narratives often ${FLEET_EMPIRICS.typicalRuntimeDaysMin}–${FLEET_EMPIRICS.typicalRuntimeDaysMax}d continuous (median ~${FLEET_EMPIRICS.typicalRuntimeDaysMedian}d) — survivor bias.`;

  return {
    nearestCases,
    bandScore,
    bandLabel,
    vsMedianWinner,
    ticketsPerSecVsMedian: vsMedianWinner,
    fleetInsight,
    empiricalRuntimeHint,
    sameClass,
  };
}

export function expectedBestShareDiff(hashes: number): number {
  if (hashes <= 0) return 0;
  return hashes / (2 ** 32 * Math.LN2);
}

export function luckFactor(bestShare: number, hashesDone: number): number {
  const expected = expectedBestShareDiff(hashesDone);
  if (expected <= 0) return 1;
  return bestShare / expected;
}

export function mechanismProximity(
  bestShare: number,
  networkDiff: number,
  hashrateHs: number
): {
  logProgress: number;
  shareGap: number;
  ticketsPerBlock: number;
  label: string;
} {
  const progress = networkDiff > 0 ? bestShare / networkDiff : 0;
  const logProgress = Math.min(1, Math.log10(1 + progress * 1e12) / 12);
  const shareGap = Math.max(0, networkDiff - bestShare);
  const netHs = networkDiff > 0 ? (networkDiff * 2 ** 32) / 600 : 0;
  const ticketsPerBlock = netHs > 0 ? hashrateHs / netHs : 0;

  let label = "Scanning nonce space";
  if (progress >= 1) label = "BLOCK THRESHOLD MET";
  else if (progress >= 0.01) label = "Extremely rare share territory";
  else if (progress >= 1e-4) label = "Strong share — same path winners take";
  else if (progress >= 1e-6) label = "Healthy share ladder climbing";
  else if (bestShare > 0) label = "Shares proving work · lottery tickets flowing";

  return { logProgress, shareGap, ticketsPerBlock, label };
}

export function formatCaseHashrate(hs: number): string {
  if (hs >= 1e15) return `${(hs / 1e15).toFixed(2)} PH/s`;
  if (hs >= 1e12) return `${(hs / 1e12).toFixed(2)} TH/s`;
  if (hs >= 1e9) return `${(hs / 1e9).toFixed(0)} GH/s`;
  if (hs >= 1e6) return `${(hs / 1e6).toFixed(0)} MH/s`;
  return `${hs} H/s`;
}

/** All non-rented cases sorted by date desc for catalog UI */
export function getCaseCatalog(): SoloWinCase[] {
  return [...SOLO_WIN_CASES]
    .filter((c) => c.class !== "rented")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
