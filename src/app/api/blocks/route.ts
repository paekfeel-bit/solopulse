import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type RecentBlock = {
  height: number;
  id: string;
  timestamp: number;
  txCount: number;
  size: number;
  poolName: string;
  poolSlug: string;
  rewardSats: number;
  totalFees: number;
  medianFee: number;
  coinbaseAddress: string | null;
};

export async function GET() {
  try {
    const res = await fetch("https://mempool.space/api/v1/blocks", {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Array<{
      id: string;
      height: number;
      timestamp: number;
      tx_count: number;
      size: number;
      extras?: {
        reward?: number;
        totalFees?: number;
        medianFee?: number;
        coinbaseAddress?: string;
        pool?: { name?: string; slug?: string };
      };
    }>;

    const tipHeight = raw[0]?.height ?? 0;
    const blocks: RecentBlock[] = (raw || []).slice(0, 8).map((b) => ({
      height: b.height,
      id: b.id,
      timestamp: b.timestamp,
      txCount: b.tx_count,
      size: b.size,
      poolName: b.extras?.pool?.name || "Unknown",
      poolSlug: b.extras?.pool?.slug || "unknown",
      rewardSats: Number(b.extras?.reward || 0),
      totalFees: Number(b.extras?.totalFees || 0),
      medianFee: Number(b.extras?.medianFee || 0),
      coinbaseAddress: b.extras?.coinbaseAddress || null,
    }));

    // Currently mining = next height after tip
    const miningHeight = tipHeight + 1;
    const last = blocks[0] || null;
    const prevTs = blocks[1]?.timestamp;
    const lastInterval =
      last && prevTs ? Math.max(0, last.timestamp - prevTs) : null;

    return NextResponse.json(
      {
        tipHeight,
        miningHeight,
        lastBlock: last,
        lastIntervalSec: lastInterval,
        blocks,
        fetchedAt: Date.now(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "blocks fetch failed" },
      { status: 502 }
    );
  }
}
