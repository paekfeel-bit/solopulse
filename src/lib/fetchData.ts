/**
 * Client-side data fetchers with same-origin API (preferred) and CORS fallbacks.
 */

import type { CkUserStats, NetworkStats } from "./types";
import { blockSubsidyAtHeight } from "./mining";
import { getPoolOption, isPublicPool } from "./pools";

const CK_POOLS = [
  "solo.ckpool.org",
  "eusolo.ckpool.org",
  "ausolo.ckpool.org",
  "sgsolo.ckpool.org",
] as const;

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchMiner(
  address: string,
  poolPref = "solo.ckpool.org"
): Promise<{ pool: string; user: CkUserStats; fetchedAt: number }> {
  try {
    const data = await fetchJson(
      `/api/miner/${encodeURIComponent(address)}?pool=${encodeURIComponent(poolPref)}`
    );
    if (data.error) throw new Error(data.error);
    return data;
  } catch {
    /* fall through to client-side */
  }

  if (isPublicPool(poolPref)) {
    const target = `https://public-pool.io:40557/api/client/${encodeURIComponent(address)}`;
    // Must go through our API ideally; try CORS proxies as last resort
    for (const url of [
      target,
      `https://corsproxy.io/?${encodeURIComponent(target)}`,
    ]) {
      try {
        const raw = await fetchJson(url);
        // Re-normalize via API shape is complex client-side — force error to show
        if (raw?.accounting || raw?.workersCount != null) {
          // Minimal map
          const acc = raw.accounting || {};
          const hr = Number(acc.hashRateLast10Minutes || 0);
          const fmt = (n: number) =>
            n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(2)}G` : String(n);
          const user: CkUserStats = {
            hashrate1m: fmt(hr),
            hashrate5m: fmt(hr),
            hashrate1hr: fmt(Number(acc.hashRateLastHour || hr)),
            hashrate1d: fmt(Number(acc.hashRateLastHour || hr)),
            hashrate7d: fmt(Number(acc.hashRateLastHour || hr)),
            lastshare: 0,
            workers: Number(raw.workersCount || 0),
            shares: Number(acc.totalAcceptedShares || 0),
            bestshare: Number(raw.bestDifficulty || acc.bestSubmissionDifficulty || 0),
            bestever: Number(raw.bestDifficulty || acc.bestSubmissionDifficulty || 0),
            authorised: 0,
            worker: [],
          };
          return { pool: "public-pool.io", user, fetchedAt: Date.now() };
        }
      } catch {
        /* next */
      }
    }
    throw new Error("Public Pool fetch failed");
  }

  const order = [poolPref, ...CK_POOLS.filter((p) => p !== poolPref)];
  let last = "not found";
  for (const host of order) {
    const target = `https://${host}/users/${encodeURIComponent(address)}`;
    for (const url of [
      target,
      `https://corsproxy.io/?${encodeURIComponent(target)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    ]) {
      try {
        const data = await fetchJson(url);
        if (data && (data.hashrate1m != null || data.workers != null || data.worker)) {
          return { pool: host, user: data as CkUserStats, fetchedAt: Date.now() };
        }
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
      }
    }
  }
  throw new Error(`Miner not found. ${last}`);
}

export async function fetchNetwork(): Promise<NetworkStats & { fetchedAt: number }> {
  try {
    return await fetchJson("/api/network");
  } catch {
    /* client */
  }

  const [diffAdj, prices, height, hashrateInfo] = await Promise.all([
    fetchJson("https://mempool.space/api/v1/difficulty-adjustment"),
    fetchJson("https://mempool.space/api/v1/prices"),
    fetchJson("https://mempool.space/api/blocks/tip/height"),
    fetchJson("https://mempool.space/api/v1/mining/hashrate/3d"),
  ]);

  const blockHeight = Number(height);
  return {
    difficulty: Number(hashrateInfo?.currentDifficulty) || 0,
    hashrate: Number(hashrateInfo?.currentHashrate) || 0,
    priceUsd: Number(prices?.USD) || 0,
    blockHeight,
    blockReward: blockSubsidyAtHeight(blockHeight),
    progressPercent: Number(diffAdj?.progressPercent) || 0,
    difficultyChange: Number(diffAdj?.difficultyChange) || 0,
    remainingBlocks: Number(diffAdj?.remainingBlocks) || 0,
    nextRetargetHeight: Number(diffAdj?.nextRetargetHeight) || 0,
    estimatedRetargetDate: Number(diffAdj?.estimatedRetargetDate) || 0,
    fetchedAt: Date.now(),
  };
}

export async function fetchLiveBtcPrice(): Promise<number> {
  // Prefer same-origin network bundle (works through Cloudflare tunnel)
  try {
    const j = await fetchJson(`/api/network?_=${Date.now()}`);
    const n = Number(j?.priceUsd);
    if (n > 0) return n;
  } catch {
    /* fallthrough */
  }
  // Coinbase spot — CORS-friendly direct
  try {
    const j = await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot");
    const n = Number(j?.data?.amount);
    if (n > 0) return n;
  } catch {
    /* fallthrough */
  }
  try {
    const j = await fetchJson("https://mempool.space/api/v1/prices");
    const n = Number(j?.USD);
    if (n > 0) return n;
  } catch {
    /* */
  }
  return 0;
}

export async function fetchAddressBlocks(address: string): Promise<{
  blocks: Array<{
    txid: string;
    height: number | null;
    valueSats: number;
    confirmed: boolean;
  }>;
}> {
  try {
    return await fetchJson(`/api/address/${encodeURIComponent(address)}`);
  } catch {
    /* direct */
  }

  try {
    const txs = await fetchJson(
      `https://mempool.space/api/address/${encodeURIComponent(address)}/txs`
    );
    const coinbases = (txs || [])
      .filter((tx: { vin?: Array<{ is_coinbase?: boolean }> }) =>
        tx.vin?.some((v) => v.is_coinbase)
      )
      .map(
        (tx: {
          txid: string;
          status?: { confirmed?: boolean; block_height?: number };
          vout?: Array<{ value: number; scriptpubkey_address?: string }>;
        }) => {
          const payout = (tx.vout || [])
            .filter((o) => o.scriptpubkey_address === address)
            .reduce((s: number, o) => s + (o.value || 0), 0);
          return {
            txid: tx.txid,
            height: tx.status?.block_height ?? null,
            confirmed: !!tx.status?.confirmed,
            valueSats: payout,
          };
        }
      )
      .filter((b: { valueSats: number }) => b.valueSats > 0);
    return { blocks: coinbases };
  } catch {
    return { blocks: [] };
  }
}

export { getPoolOption };
