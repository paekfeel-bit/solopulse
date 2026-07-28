import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type OhlcBar = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * BTC/USDT 1h OHLC for chart tab.
 * Primary: Binance public klines. Fallback: Coinbase candles (if available).
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(
    168,
    Math.max(24, Number(req.nextUrl.searchParams.get("limit")) || 72)
  );
  const interval = req.nextUrl.searchParams.get("interval") || "1h";

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("empty klines");

    const bars: OhlcBar[] = raw.map((row) => {
      const r = row as (string | number)[];
      return {
        t: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      };
    });

    const last = bars[bars.length - 1];
    const first = bars[0];
    const changePct =
      first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;

    return NextResponse.json(
      {
        symbol: "BTCUSDT",
        interval,
        bars,
        lastClose: last.close,
        changePct,
        source: "binance.klines",
        fetchedAt: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e1) {
    // Fallback: aggregate Coinbase spot only into synthetic single point — better try Kraken
    try {
      const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`kraken ${res.status}`);
      const j = (await res.json()) as {
        result?: Record<string, (string | number)[][]>;
      };
      const key = j.result
        ? Object.keys(j.result).find((k) => k !== "last")
        : null;
      const series = key && j.result ? j.result[key] : null;
      if (!series?.length) throw new Error("no kraken ohlc");

      const sliced = series.slice(-limit);
      const bars: OhlcBar[] = sliced.map((r) => ({
        t: Number(r[0]) * 1000,
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[6] ?? r[5] ?? 0),
      }));
      const last = bars[bars.length - 1];
      const first = bars[0];
      const changePct =
        first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;

      return NextResponse.json(
        {
          symbol: "XBTUSD",
          interval: "1h",
          bars,
          lastClose: last.close,
          changePct,
          source: "kraken.ohlc",
          fetchedAt: Date.now(),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        }
      );
    } catch (e2) {
      return NextResponse.json(
        {
          error:
            e1 instanceof Error
              ? e1.message
              : e2 instanceof Error
                ? e2.message
                : "ohlc fetch failed",
          bars: [],
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
}
