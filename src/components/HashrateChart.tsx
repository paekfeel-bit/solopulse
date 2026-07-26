"use client";

import { useMemo } from "react";
import type { HashrateSample } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

interface Props {
  samples: HashrateSample[];
}

export function HashrateChart({ samples }: Props) {
  const { t, locale } = useI18n();
  const { path, area, min, max, last, w, h, spanSec } = useMemo(() => {
    const w = 600;
    const h = 160;
    const pad = 8;
    if (!samples.length) {
      return { path: "", area: "", min: 0, max: 0, last: 0, w, h, spanSec: 0 };
    }
    const vals = samples.map((s) => s.ghs);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min = min * 0.9;
      max = max * 1.1 || 1;
    }
    const range = max - min || 1;
    const n = samples.length;
    // Prefer time-based X when timestamps exist (more accurate than index)
    const t0 = samples[0].t;
    const t1 = samples[n - 1].t;
    const span = Math.max(1, t1 - t0);
    const pts = samples.map((s, i) => {
      const x =
        n === 1
          ? w / 2
          : pad + ((s.t - t0) / span) * (w - pad * 2);
      // fallback evenly if timestamps collapsed
      const xIdx = pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
      const useX = t1 > t0 ? x : xIdx;
      const y = h - pad - ((s.ghs - min) / range) * (h - pad * 2);
      return { x: useX, y };
    });
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area =
      path +
      ` L${pts[pts.length - 1].x.toFixed(1)},${h - pad} L${pts[0].x.toFixed(1)},${h - pad} Z`;
    return {
      path,
      area,
      min,
      max,
      last: vals[vals.length - 1],
      w,
      h,
      spanSec: Math.round(span / 1000),
    };
  }, [samples]);

  const hint =
    locale === "ko"
      ? `GH/s · 1초 샘플 · ${samples.length}점${spanSec > 0 ? ` · ${spanSec}s` : ""}`
      : locale === "ja"
        ? `GH/s · 1秒サンプル · ${samples.length}点`
        : `GH/s · 1s samples · ${samples.length} pts${spanSec > 0 ? ` · ${spanSec}s` : ""}`;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--fg)]">{t("history")}</h2>
          <p className="text-[10px] sm:text-[11px] text-[var(--muted)] leading-snug break-words">
            {hint}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base sm:text-lg font-mono font-semibold text-amber-400 tabular-nums">
            {last > 0 ? last.toFixed(2) : "—"}{" "}
            <span className="text-xs text-[var(--muted)] font-normal">GH/s</span>
          </div>
        </div>
      </div>

      <div className="relative w-full h-40 rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
        {samples.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            {locale === "ko"
              ? "샘플 수집 중… 데이터가 쌓이면 차트가 채워집니다"
              : "Collecting samples… chart fills as data arrives"}
          </div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#hrFill)" />
            <path
              d={path}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {samples.length >= 2 && (
          <div className="absolute top-2 left-2 text-[10px] font-mono text-[var(--muted)]">
            max {max.toFixed(1)}
          </div>
        )}
        {samples.length >= 2 && (
          <div className="absolute bottom-2 left-2 text-[10px] font-mono text-[var(--muted)]">
            min {min.toFixed(1)}
          </div>
        )}
      </div>
    </section>
  );
}
