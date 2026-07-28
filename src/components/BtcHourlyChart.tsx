"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Bar = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function fmtUsd(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;
}

export function BtcHourlyChart() {
  const { locale } = useI18n();
  const [bars, setBars] = useState<Bar[]>([]);
  const [changePct, setChangePct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastClose, setLastClose] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/charts/btc-ohlc?interval=1h&limit=72&_=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setBars(Array.isArray(j.bars) ? j.bars : []);
        setChangePct(Number(j.changePct) || 0);
        setLastClose(Number(j.lastClose) || 0);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const chart = useMemo(() => {
    const w = 600;
    const h = 180;
    const padL = 8;
    const padR = 8;
    const padT = 12;
    const padB = 10;
    type Candle = {
      wick: string;
      body: { x: number; y: number; w: number; h: number };
      up: boolean;
    };
    if (bars.length < 2) {
      return {
        w,
        h,
        candles: [] as Candle[],
        up: true,
        min: 0,
        max: 0,
      };
    }
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    if (min === max) {
      min *= 0.99;
      max *= 1.01;
    }
    const range = max - min || 1;
    const n = bars.length;
    const slot = (w - padL - padR) / n;
    const bodyW = Math.max(1.5, Math.min(6, slot * 0.55));

    const candles = bars.map((b, i) => {
      const x = padL + i * slot + slot / 2;
      const yH = padT + ((max - b.high) / range) * (h - padT - padB);
      const yL = padT + ((max - b.low) / range) * (h - padT - padB);
      const yO = padT + ((max - b.open) / range) * (h - padT - padB);
      const yC = padT + ((max - b.close) / range) * (h - padT - padB);
      const up = b.close >= b.open;
      const top = Math.min(yO, yC);
      const bot = Math.max(yO, yC);
      const bodyH = Math.max(1, bot - top);
      return {
        wick: `M${x.toFixed(1)},${yH.toFixed(1)} L${x.toFixed(1)},${yL.toFixed(1)}`,
        body: {
          x: x - bodyW / 2,
          y: top,
          w: bodyW,
          h: bodyH,
        },
        up,
      };
    });

    return {
      w,
      h,
      candles,
      min,
      max,
      up: changePct >= 0,
    };
  }, [bars, changePct]);

  const title =
    locale === "ko"
      ? "비트코인 1시간봉"
      : locale === "ja"
        ? "BTC 1時間足"
        : "Bitcoin 1h candles";
  const hint =
    locale === "ko"
      ? `BTC/USDT · 1h · ${bars.length}봉 · 최근 72시간`
      : `BTC/USDT · 1h · ${bars.length} bars · ~72h`;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--fg)]">{title}</h2>
          <p className="text-[10px] sm:text-[11px] text-[var(--muted)] leading-snug">
            {hint}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base sm:text-lg font-mono font-semibold text-amber-400 tabular-nums">
            {fmtUsd(lastClose)}
          </div>
          <div
            className={`text-[11px] font-mono tabular-nums ${
              changePct >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="relative w-full h-44 rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
        {loading && bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            {locale === "ko" ? "시세 불러오는 중…" : "Loading candles…"}
          </div>
        ) : error && bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400/90 px-3 text-center">
            {locale === "ko" ? `시세 로드 실패 · ${error}` : `Failed · ${error}`}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {chart.candles.map((c, i) => (
              <g key={i}>
                <path
                  d={c.wick}
                  fill="none"
                  stroke={c.up ? "#34d399" : "#f87171"}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={c.body.x}
                  y={c.body.y}
                  width={c.body.w}
                  height={c.body.h}
                  fill={c.up ? "#10b981" : "#ef4444"}
                  opacity={0.9}
                />
              </g>
            ))}
          </svg>
        )}
        {bars.length >= 2 && chart.max != null && (
          <>
            <div className="absolute top-2 left-2 text-[10px] font-mono text-[var(--muted)]">
              H {fmtUsd(chart.max)}
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] font-mono text-[var(--muted)]">
              L {fmtUsd(chart.min ?? 0)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
