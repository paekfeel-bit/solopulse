"use client";

import { useEffect, useState } from "react";
import type { SourceContact, SourceStep } from "@/lib/sourceContact";
import { useI18n, type Locale } from "@/lib/i18n";

/**
 * Real-data radar for success-source contact.
 * All motion is driven by live step scores / last-share age / hashrate — nothing random.
 */

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function polygonPoints(
  cx: number,
  cy: number,
  radii: number[],
  startAngle = 0
): string {
  const n = radii.length;
  return radii
    .map((r, i) => {
      const p = polar(cx, cy, r, startAngle + (i * 360) / n);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

export function SourceRadar({
  contact,
  hashrateHs,
  lastShareUnix,
}: {
  contact: SourceContact;
  hashrateHs: number;
  lastShareUnix: number;
}) {
  const { locale } = useI18n();
  // 1s tick so "last share age" and online arc breathe from real clock
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastAge =
    lastShareUnix > 0 ? Math.max(0, now / 1000 - lastShareUnix) : 9999;

  // Real hash flow speed: board TH/s → CSS duration (faster when more HR)
  const th = hashrateHs / 1e12;
  const flowSec = Math.max(0.8, Math.min(6, 8 / Math.max(0.3, th)));

  // Online freshness 0-1 from real last-share age
  const freshness = lastAge < 30 ? 1 : lastAge < 120 ? 0.7 : lastAge < 600 ? 0.35 : 0.1;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 88;

  const steps = contact.steps;
  const radii = steps.map((s) => 18 + s.score * (maxR - 18));
  const poly = polygonPoints(cx, cy, radii);
  const grid = [0.33, 0.66, 1].map((f) =>
    polygonPoints(
      cx,
      cy,
      steps.map(() => 18 + f * (maxR - 18))
    )
  );

  // Arc dash for overall — real percentage
  const circumference = 2 * Math.PI * 96;
  const dash = (contact.overall / 100) * circumference;

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[260px] h-auto"
        role="img"
        aria-label={`Source contact ${contact.overall.toFixed(0)} percent`}
      >
        <defs>
          <linearGradient id="srcFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="srcStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>

        {/* Outer ring — overall contact */}
        <circle
          cx={cx}
          cy={cy}
          r={96}
          fill="none"
          stroke="var(--border)"
          strokeWidth="6"
          opacity="0.5"
        />
        <circle
          cx={cx}
          cy={cy}
          r={96}
          fill="none"
          stroke="url(#srcStroke)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700"
          style={{
            filter:
              contact.overall >= 90
                ? "drop-shadow(0 0 8px rgba(16,185,129,0.7))"
                : undefined,
          }}
        />

        {/* Grid hexes */}
        {grid.map((g, i) => (
          <polygon
            key={i}
            points={g}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            opacity={0.5}
          />
        ))}

        {/* Axes */}
        {steps.map((_, i) => {
          const p = polar(cx, cy, maxR, (i * 360) / steps.length);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.4"
            />
          );
        })}

        {/* Live polygon from real step scores */}
        <polygon
          points={poly}
          fill="url(#srcFill)"
          stroke="#fbbf24"
          strokeWidth="2"
          className="transition-all duration-700"
          style={{
            opacity: 0.35 + freshness * 0.45,
          }}
        />

        {/* Vertices — pulse when step is ON (real status) */}
        {steps.map((s, i) => {
          const p = polar(cx, cy, radii[i], (i * 360) / steps.length);
          const on = s.status === "on";
          return (
            <g key={s.id}>
              {on && (
                <circle cx={p.x} cy={p.y} r="8" fill="#10b981" opacity="0.25">
                  <animate
                    attributeName="r"
                    values="6;12;6"
                    dur={`${flowSec}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.4;0.1;0.4"
                    dur={`${flowSec}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill={
                  s.status === "on"
                    ? "#10b981"
                    : s.status === "partial"
                      ? "#f59e0b"
                      : "#52525b"
                }
                className="transition-all duration-500"
              />
            </g>
          );
        })}

        {/* Center % */}
        <circle
          cx={cx}
          cy={cy}
          r="28"
          fill="var(--bg)"
          stroke={contact.overall >= 90 ? "#10b981" : "var(--border)"}
          strokeWidth="2"
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-[var(--fg)]"
          style={{ fontSize: "18px", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}
        >
          {contact.overall.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          style={{
            fontSize: "8px",
            fill: "var(--muted)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {contact.overall >= 90 ? "HOT" : contact.touching ? "LIVE" : "…"}
        </text>

        {/* Hash flow dots along axis 0 — count/speed from real TH/s */}
        {Array.from({ length: Math.min(6, Math.max(2, Math.round(th))) }).map((_, i) => {
          const p0 = polar(cx, cy, 20, 0);
          const p1 = polar(cx, cy, maxR, 0);
          return (
            <circle key={i} r="2" fill="#fbbf24" opacity="0.8">
              <animate
                attributeName="cx"
                values={`${p0.x};${p1.x}`}
                dur={`${flowSec}s`}
                begin={`${(i * flowSec) / 6}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values={`${p0.y};${p1.y}`}
                dur={`${flowSec}s`}
                begin={`${(i * flowSec) / 6}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0.9;0"
                dur={`${flowSec}s`}
                begin={`${(i * flowSec) / 6}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>

      {/* Step chips under radar */}
      <div className="w-full grid grid-cols-3 gap-1.5 mt-1">
        {steps.map((s) => (
          <StepChip key={s.id} step={s} locale={locale} />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center leading-relaxed max-w-sm">
        {locale === "ko"
          ? `실데이터: 셰어 ${lastAge < 9999 ? `${Math.floor(lastAge)}s 전` : "—"} · ${th.toFixed(2)} TH/s · 흐름 속도 ∝ 해시레이트`
          : locale === "ja"
            ? `実データ: シェア ${lastAge < 9999 ? `${Math.floor(lastAge)}s 前` : "—"} · ${th.toFixed(2)} TH/s · 速度∝ハッシュレート`
            : `Live data: share ${lastAge < 9999 ? `${Math.floor(lastAge)}s ago` : "—"} · ${th.toFixed(2)} TH/s · flow ∝ hashrate`}
      </p>
    </div>
  );
}

function StepChip({ step, locale }: { step: SourceStep; locale: Locale }) {
  const bg =
    step.status === "on"
      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
      : step.status === "partial"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
        : "border-[var(--border)] text-[var(--muted)]";
  return (
    <div className={`rounded-lg border px-1.5 py-1 text-center min-w-0 ${bg}`}>
      <div className="text-[9px] font-semibold truncate">{pick(locale, step.title)}</div>
      <div className="text-[10px] font-mono tabular-nums">
        {(step.score * 100).toFixed(0)}%
      </div>
    </div>
  );
}
