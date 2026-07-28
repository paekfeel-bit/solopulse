import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DifficultyPoint = {
  t: number;
  difficulty: number;
  height?: number;
  hashrate?: number;
};

/**
 * Mining difficulty (+ optional hashrate) history from mempool.space.
 * period: 1m | 3m | 6m | 1y | 2y | 3y
 */
export async function GET(req: NextRequest) {
  const period = (req.nextUrl.searchParams.get("period") || "1y").toLowerCase();
  const allowed = new Set(["1m", "3m", "6m", "1y", "2y", "3y"]);
  const p = allowed.has(period) ? period : "1y";

  try {
    const url = `https://mempool.space/api/v1/mining/hashrate/${p}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`mempool ${res.status}`);
    const j = (await res.json()) as {
      difficulty?: { time: number; difficulty: number; height: number }[];
      hashrates?: { timestamp: number; avgHashrate: number }[];
      currentDifficulty?: number;
      currentHashrate?: number;
    };

    const points: DifficultyPoint[] = (j.difficulty || []).map((d) => ({
      t: Number(d.time) * 1000,
      difficulty: Number(d.difficulty) || 0,
      height: Number(d.height) || undefined,
    }));

    // If difficulty array sparse, also map hashrate series as secondary
    const hashrateSeries = (j.hashrates || []).map((h) => ({
      t: Number(h.timestamp) * 1000,
      hashrate: Number(h.avgHashrate) || 0,
    }));

    // Attach nearest hashrate to difficulty points when possible
    if (hashrateSeries.length && points.length) {
      let hi = 0;
      for (const pt of points) {
        while (
          hi < hashrateSeries.length - 1 &&
          hashrateSeries[hi + 1].t <= pt.t
        ) {
          hi++;
        }
        pt.hashrate = hashrateSeries[hi]?.hashrate;
      }
    }

    // Fallback: only hashrate series with current difficulty stamp
    if (!points.length && j.currentDifficulty) {
      points.push({
        t: Date.now(),
        difficulty: Number(j.currentDifficulty),
        hashrate: Number(j.currentHashrate) || undefined,
      });
    }

    const last = points[points.length - 1];
    const first = points[0];
    const changePct =
      first && first.difficulty > 0 && last
        ? ((last.difficulty - first.difficulty) / first.difficulty) * 100
        : 0;

    return NextResponse.json(
      {
        period: p,
        points,
        currentDifficulty: Number(j.currentDifficulty) || last?.difficulty || 0,
        currentHashrate: Number(j.currentHashrate) || 0,
        changePct,
        source: "mempool.mining.hashrate",
        fetchedAt: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "difficulty history failed",
        points: [],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
