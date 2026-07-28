"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDifficulty } from "@/lib/mining";
import { useI18n } from "@/lib/i18n";

type Point = {
  t: number;
  difficulty: number;
  height?: number;
  hashrate?: number;
};

function fmtEh(hs: number) {
  if (!Number.isFinite(hs) || hs <= 0) return "—";
  const eh = hs / 1e18;
  if (eh >= 100) return `${eh.toFixed(0)} EH/s`;
  if (eh >= 1) return `${eh.toFixed(1)} EH/s`;
  return `${(hs / 1e15).toFixed(1)} PH/s`;
}

export function DifficultyChart() {
  const { locale, t } = useI18n();
  const [period, setPeriod] = useState<"3m" | "1y" | "3y">("1y");
  const [points, setPoints] = useState<Point[]>([]);
  const [current, setCurrent] = useState(0);
  const [hashrate, setHashrate] = useState(0);
  const [changePct, setChangePct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/charts/difficulty?period=${period}&_=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setPoints(Array.isArray(j.points) ? j.points : []);
        setCurrent(Number(j.currentDifficulty) || 0);
        setHashrate(Number(j.currentHashrate) || 0);
        setChangePct(Number(j.changePct) || 0);
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
    const id = setInterval(load, 300_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [period]);

  const chart = useMemo(() => {
    const w = 600;
    const h = 180;
    const pad = 10;
    if (points.length < 2) {
      return { w, h, path: "", area: "", min: 0, max: 0 };
    }
    const vals = points.map((p) => p.difficulty).filter((v) => v > 0);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min *= 0.95;
      max *= 1.05;
    }
    const range = max - min || 1;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const pts = points.map((p, i) => {
      const x =
        t1 > t0
          ? pad + ((p.t - t0) / span) * (w - pad * 2)
          : pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p.difficulty - min) / range) * (h - pad * 2);
      return { x, y };
    });
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area =
      path +
      ` L${pts[pts.length - 1].x.toFixed(1)},${h - pad} L${pts[0].x.toFixed(1)},${h - pad} Z`;
    return { w, h, path, area, min, max };
  }, [points]);

  const title =
    locale === "ko"
      ? "채굴 난이도"
      : locale === "ja"
        ? "採掘難易度"
        : "Mining difficulty";
  const periodLabel =
    period === "3m"
      ? locale === "ko"
        ? "3개월"
        : "3m"
      : period === "3y"
        ? locale === "ko"
          ? "3년"
          : "3y"
        : locale === "ko"
          ? "1년"
          : "1y";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--fg)]">{title}</h2>
          <p className="text-[10px] sm:text-[11px] text-[var(--muted)] leading-snug">
            {locale === "ko"
              ? `네트워크 난이도 · ${periodLabel} · ${points.length}점`
              : `Network difficulty · ${periodLabel} · ${points.length} pts`}
            {hashrate > 0 ? ` · ${fmtEh(hashrate)}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base sm:text-lg font-mono font-semibold text-sky-400 tabular-nums">
            {current > 0 ? formatDifficulty(current) : "—"}
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

      <div className="flex gap-1 mb-2">
        {(["3m", "1y", "3y"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition ${
              period === p
                ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                : "border-stone-700 text-stone-500 hover:text-stone-300"
            }`}
          >
            {p === "3m"
              ? locale === "ko"
                ? "3M"
                : "3M"
              : p === "1y"
                ? locale === "ko"
                  ? "1Y"
                  : "1Y"
                : locale === "ko"
                  ? "3Y"
                  : "3Y"}
          </button>
        ))}
      </div>

      <div className="relative w-full h-44 rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
        {loading && points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            {locale === "ko" ? "난이도 이력 불러오는 중…" : "Loading difficulty…"}
          </div>
        ) : error && points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400/90 px-3 text-center">
            {locale === "ko" ? `로드 실패 · ${error}` : `Failed · ${error}`}
          </div>
        ) : points.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            {locale === "ko" ? "데이터 부족" : "Not enough data"}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="diffFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chart.area} fill="url(#diffFill)" />
            <path
              d={chart.path}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {points.length >= 2 && (
          <>
            <div className="absolute top-2 left-2 text-[10px] font-mono text-[var(--muted)]">
              max {formatDifficulty(chart.max)}
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] font-mono text-[var(--muted)]">
              min {formatDifficulty(chart.min)}
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted)] leading-relaxed">
        {locale === "ko"
          ? `${t("difficulty")}는 약 2주(2016블록)마다 조정됩니다. 출처: mempool.space`
          : `Difficulty adjusts ~every 2016 blocks (~2 weeks). Source: mempool.space`}
      </p>
    </section>
  );
}
