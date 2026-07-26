import { NextResponse } from "next/server";
import { blockSubsidyAtHeight } from "@/lib/mining";
import { networkHashrateFromDifficulty } from "@/lib/soloProbability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function softJson(url: string, ms = 5_000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") || ct.includes("text/json") || ct.includes("text/plain")) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // plain number responses (blockchain.info style)
        const n = Number(text.trim());
        return Number.isFinite(n) ? n : null;
      }
    }
    return await res.json();
  } catch {
    return null;
  }
}

type PartialNet = {
  difficulty?: number;
  hashrate?: number;
  priceUsd?: number;
  blockHeight?: number;
  progressPercent?: number;
  difficultyChange?: number;
  remainingBlocks?: number;
  nextRetargetHeight?: number;
  estimatedRetargetDate?: number;
  source?: string;
};

/**
 * Multi-API fallback for network difficulty / hashrate / price / height.
 * Order: mempool.space → blockchain.info → blockstream → derive H from D.
 */
export async function GET() {
  const sources: string[] = [];
  const acc: PartialNet = {};

  try {
    // ── Primary batch: mempool.space ──
    const [diffAdj, prices, height, hashrateInfo, coinbase] = await Promise.all([
      softJson("https://mempool.space/api/v1/difficulty-adjustment"),
      softJson("https://mempool.space/api/v1/prices"),
      softJson("https://mempool.space/api/blocks/tip/height"),
      softJson("https://mempool.space/api/v1/mining/hashrate/3d"),
      softJson("https://api.coinbase.com/v2/prices/BTC-USD/spot", 4_000),
    ]);

    if (diffAdj && typeof diffAdj === "object") {
      const d = diffAdj as Record<string, unknown>;
      acc.progressPercent = Number(d.progressPercent) || 0;
      acc.difficultyChange = Number(d.difficultyChange) || 0;
      acc.remainingBlocks = Number(d.remainingBlocks) || 0;
      acc.nextRetargetHeight = Number(d.nextRetargetHeight) || 0;
      acc.estimatedRetargetDate = Number(d.estimatedRetargetDate) || 0;
      sources.push("mempool.difficulty-adjustment");
    }

    if (hashrateInfo && typeof hashrateInfo === "object") {
      const h = hashrateInfo as Record<string, unknown>;
      const diff = Number(h.currentDifficulty) || 0;
      const hr = Number(h.currentHashrate) || 0;
      if (diff > 0) {
        acc.difficulty = diff;
        sources.push("mempool.hashrate.difficulty");
      }
      if (hr > 0) {
        acc.hashrate = hr;
        sources.push("mempool.hashrate.3d");
      }
    }

    if (height != null && Number(height) > 0) {
      acc.blockHeight = Number(height);
      sources.push("mempool.tip");
    }

    if (prices && typeof prices === "object") {
      const p = prices as Record<string, unknown>;
      const usd = Number(p.USD) || 0;
      if (usd > 0) {
        acc.priceUsd = usd;
        sources.push("mempool.prices");
      }
    }

    const cb = coinbase as { data?: { amount?: string } } | null;
    if (!(acc.priceUsd && acc.priceUsd > 0) && cb?.data?.amount) {
      const n = Number(cb.data.amount);
      if (n > 0) {
        acc.priceUsd = n;
        sources.push("coinbase.spot");
      }
    }

    // ── Fallback: blockchain.info ──
    if (!(acc.difficulty && acc.difficulty > 0) || !(acc.blockHeight && acc.blockHeight > 0)) {
      const [bcDiff, bcHeight] = await Promise.all([
        softJson("https://blockchain.info/q/getdifficulty", 4_000),
        softJson("https://blockchain.info/q/getblockcount", 4_000),
      ]);
      if (!(acc.difficulty && acc.difficulty > 0) && Number(bcDiff) > 0) {
        acc.difficulty = Number(bcDiff);
        sources.push("blockchain.info.difficulty");
      }
      if (!(acc.blockHeight && acc.blockHeight > 0) && Number(bcHeight) > 0) {
        acc.blockHeight = Number(bcHeight);
        sources.push("blockchain.info.height");
      }
    }

    // ── Fallback: blockstream ──
    if (!(acc.blockHeight && acc.blockHeight > 0)) {
      const tip = await softJson("https://blockstream.info/api/blocks/tip/height", 4_000);
      if (Number(tip) > 0) {
        acc.blockHeight = Number(tip);
        sources.push("blockstream.tip");
      }
    }

    // ── Fallback: mempool.space difficulty only endpoint ──
    if (!(acc.difficulty && acc.difficulty > 0)) {
      const d2 = await softJson("https://mempool.space/api/v1/difficulty-adjustment", 4_000);
      // sometimes difficulty is only in hashrate endpoint — try again via blocks
      void d2;
    }

    // ── Derive network hashrate from difficulty if missing ──
    if (!(acc.hashrate && acc.hashrate > 0) && acc.difficulty && acc.difficulty > 0) {
      acc.hashrate = networkHashrateFromDifficulty(acc.difficulty);
      sources.push("derived.hashrate.fromDifficulty");
    }

    // ── Cross-check: if H and D both present, keep measured H ──
    const difficulty = acc.difficulty || 0;
    let networkHashrate = acc.hashrate || 0;
    if (!(networkHashrate > 0) && difficulty > 0) {
      networkHashrate = networkHashrateFromDifficulty(difficulty);
      sources.push("derived.hashrate.final");
    }

    const blockHeight = acc.blockHeight || 0;
    const priceUsd = acc.priceUsd || 0;
    const blockReward = blockHeight > 0 ? blockSubsidyAtHeight(blockHeight) : 3.125;

    if (!difficulty && !blockHeight && !priceUsd && !networkHashrate) {
      return NextResponse.json(
        { error: "Network sources unavailable", sources },
        { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Expected share helper constants for clients
    const two32 = 2 ** 32;
    const hashesPerBlock = difficulty > 0 ? difficulty * two32 : 0;

    return NextResponse.json(
      {
        difficulty,
        hashrate: networkHashrate,
        priceUsd,
        blockHeight,
        blockReward,
        progressPercent: acc.progressPercent || 0,
        difficultyChange: acc.difficultyChange || 0,
        remainingBlocks: acc.remainingBlocks || 0,
        nextRetargetHeight: acc.nextRetargetHeight || 0,
        estimatedRetargetDate: acc.estimatedRetargetDate || 0,
        hashesPerBlock,
        blockTargetSec: 600,
        sources,
        fetchedAt: Date.now(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Network fetch failed",
        sources,
      },
      { status: 502 }
    );
  }
}
