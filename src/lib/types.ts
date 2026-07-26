export interface CkWorker {
  workername: string;
  hashrate1m: string;
  hashrate5m: string;
  hashrate1hr: string;
  hashrate1d: string;
  hashrate7d: string;
  lastshare: number;
  shares: number;
  bestshare: number;
  bestever: number;
}

export interface CkUserStats {
  hashrate1m: string;
  hashrate5m: string;
  hashrate1hr: string;
  hashrate1d: string;
  hashrate7d: string;
  lastshare: number;
  workers: number;
  shares: number;
  bestshare: number;
  bestever: number;
  authorised: number;
  worker: CkWorker[];
}

export interface NetworkStats {
  difficulty: number;
  hashrate: number;
  priceUsd: number;
  blockHeight: number;
  blockReward: number;
  progressPercent: number;
  difficultyChange: number;
  remainingBlocks: number;
  nextRetargetHeight: number;
  estimatedRetargetDate: number;
  /** D · 2³² when available */
  hashesPerBlock?: number;
  blockTargetSec?: number;
  /** Which upstream APIs contributed (multi-fallback) */
  sources?: string[];
  fetchedAt?: number;
}

export interface MinerDashboardData {
  address: string;
  pool: string;
  user: CkUserStats;
  network: NetworkStats;
  fetchedAt: number;
}

export interface HashrateSample {
  t: number;
  ghs: number;
}

export interface BlockOdds {
  day: number;
  week: number;
  month: number;
  year: number;
  expectedSeconds: number;
  hashesPerBlock: number;
  ratePerSecond: number;
}

export type CkPoolHost =
  | "solo.ckpool.org"
  | "eusolo.ckpool.org"
  | "ausolo.ckpool.org"
  | "sgsolo.ckpool.org";
