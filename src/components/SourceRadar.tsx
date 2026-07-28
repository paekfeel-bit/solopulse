"use client";

import { useEffect, useMemo, useState } from "react";
import type { SourceContact, SourceStep } from "@/lib/sourceContact";
import { useI18n, type Locale } from "@/lib/i18n";

/**
 * Real-data radar for success-source contact.
 * Geometry: regular n-gon axes share ONE radius system with the outer ring
 * so vertices at score=1 sit exactly on the contact circle.
 */

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

/** Angle 0° = top (12 o'clock), clockwise positive for radar axes */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function axisAngle(i: number, n: number, startAngle = 0) {
  return startAngle + (i * 360) / n;
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
      const p = polar(cx, cy, r, axisAngle(i, n, startAngle));
      return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastAge =
    lastShareUnix > 0 ? Math.max(0, now / 1000 - lastShareUnix) : 9999;

  const th = hashrateHs / 1e12;
  const flowSec = Math.max(0.8, Math.min(6, 8 / Math.max(0.3, th)));
  const freshness =
    lastAge < 30 ? 1 : lastAge < 120 ? 0.7 : lastAge < 600 ? 0.35 : 0.1;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;

  /**
   * Unified geometry:
   * - outer ring centerline = R_RING
   * - polygon max radius = R_RING (vertices touch ring when score=1)
   * - stroke half-widths kept in mind for visual tangency
   */
  const R_RING = 92;
  const RING_STROKE = 5;
  // Vertices sit on ring inner face so fill/stroke doesn't spill outside ring
  const R_MAX = R_RING - RING_STROKE / 2;
  const R_MIN = 20;
  const START = 0; // first axis at top

  const steps = contact.steps;
  const n = Math.max(3, steps.length);

  const radii = useMemo(
    () => steps.map((s) => R_MIN + Math.max(0, Math.min(1, s.score)) * (R_MAX - R_MIN)),
    [steps]
  );

  const poly = useMemo(
    () => polygonPoints(cx, cy, radii, START),
    [cx, cy, radii]
  );

  // Regular grid polygons at fixed fractions of R_MAX (same axes as data poly)
  const grid = useMemo(
    () =>
      [1 / 3, 2 / 3, 1].map((f) => {
        const rr = R_MIN + f * (R_MAX - R_MIN);
        return polygonPoints(
          cx,
          cy,
          Array.from({ length: n }, () => rr),
          START
        );
      }),
    [cx, cy, n]
  );

  // Circumference must use same R_RING as the drawn circle
  const circumference = 2 * Math.PI * R_RING;
  const dash = (Math.max(0, Math.min(100, contact.overall)) / 100) * circumference;

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

        {/* Outer contact ring — same R as polygon max */}
        <circle
          cx={cx}
          cy={cy}
          r={R_RING}
          fill="none"
          stroke="var(--border)"
          strokeWidth={RING_STROKE}
          opacity="0.5"
        />
        <circle
          cx={cx}
          cy={cy}
          r={R_RING}
          fill="none"
          stroke="url(#srcStroke)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700"
          style={{
            filter:
              contact.overall >= 90
                ? "drop-shadow(0 0 8px rgba(16,185,129,0.7))"
                : undefined,
          }}
        />

        {/* Reference circle at R_MAX (exact vertex orbit) — faint guide */}
        <circle
          cx={cx}
          cy={cy}
          r={R_MAX}
          fill="none"
          stroke="var(--border)"
          strokeWidth="0.75"
          opacity="0.35"
          strokeDasharray="2 4"
        />

        {/* Grid regular n-gons (same axes) */}
        {grid.map((g, i) => (
          <polygon
            key={i}
            points={g}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            opacity={0.45 + i * 0.08}
          />
        ))}

        {/* Axes: center → ring (full R_MAX so tips meet vertex orbit / touch ring) */}
        {steps.map((_, i) => {
          const tip = polar(cx, cy, R_MAX, axisAngle(i, n, START));
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.45"
            />
          );
        })}

        {/* Live polygon — vertices on same polar axes */}
        <polygon
          points={poly}
          fill="url(#srcFill)"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinejoin="round"
          className="transition-all duration-700"
          style={{ opacity: 0.35 + freshness * 0.45 }}
        />

        {/* Vertices + contact dots on axes */}
        {steps.map((s, i) => {
          const ang = axisAngle(i, n, START);
          const p = polar(cx, cy, radii[i], ang);
          // Full-score target sits on R_MAX (touches guide + aligns with ring)
          const tip = polar(cx, cy, R_MAX, ang);
          const on = s.status === "on";
          const full = s.score >= 0.995;
          return (
            <g key={s.id}>
              {/* Ring contact mark when step is full */}
              {full && (
                <circle
                  cx={tip.x}
                  cy={tip.y}
                  r="3"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="1.5"
                  opacity="0.9"
                />
              )}
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
          style={{
            fontSize: "18px",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
          }}
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

        {/* Hash flow along axis 0 (top) — same polar system */}
        {Array.from({
          length: Math.min(6, Math.max(2, Math.round(th) || 2)),
        }).map((_, i) => {
          const p0 = polar(cx, cy, R_MIN, START);
          const p1 = polar(cx, cy, R_MAX, START);
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

      <div className="w-full grid grid-cols-3 gap-1.5 mt-1">
        {steps.map((s) => (
          <StepChip key={s.id} step={s} locale={locale} />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center leading-relaxed max-w-sm">
        {locale === "ko"
          ? `실데이터: 셰어 ${lastAge < 9999 ? `${Math.floor(lastAge)}s 전` : "—"} · ${th.toFixed(2)} TH/s · 100% 꼭짓점 = 원 접점`
          : locale === "ja"
            ? `実データ: シェア ${lastAge < 9999 ? `${Math.floor(lastAge)}s 前` : "—"} · ${th.toFixed(2)} TH/s`
            : `Live: share ${lastAge < 9999 ? `${Math.floor(lastAge)}s ago` : "—"} · ${th.toFixed(2)} TH/s · 100% vertex = ring contact`}
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
      <div className="text-[9px] font-semibold truncate">
        {pick(locale, step.title)}
      </div>
      <div className="text-[10px] font-mono tabular-nums">
        {(step.score * 100).toFixed(0)}%
      </div>
    </div>
  );
}
