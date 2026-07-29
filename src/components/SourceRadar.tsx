"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { SourceContact, SourceStep } from "@/lib/sourceContact";
import { useI18n, type Locale } from "@/lib/i18n";

/**
 * Real-data radar for success-source contact.
 * When `live`, ring/sweep/particles animate; offline freezes (dead look).
 */

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

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
  live = false,
  /** v2.5 block readiness 0–100 */
  readiness,
  /** EVT 24h probability 0–1 */
  evt24h,
}: {
  contact: SourceContact;
  hashrateHs: number;
  lastShareUnix: number;
  /** Board + network live — false freezes all motion */
  live?: boolean;
  readiness?: number;
  evt24h?: number;
}) {
  const { locale } = useI18n();
  const uid = useId().replace(/:/g, "");
  const [now, setNow] = useState(() => Date.now());
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Smooth rotation clock only while live
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let alive = true;
    const t0 = performance.now();
    const loop = (t: number) => {
      if (!alive) return;
      // ~1 revolution / 8s
      setSpin(((t - t0) / 1000) * 45);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [live]);

  const lastAge =
    lastShareUnix > 0 ? Math.max(0, now / 1000 - lastShareUnix) : 9999;

  const th = hashrateHs / 1e12;
  const flowSec = live
    ? Math.max(0.7, Math.min(4.5, 6 / Math.max(0.25, th || 0.4)))
    : 999;
  const freshness =
    !live
      ? 0.12
      : lastAge < 30
        ? 1
        : lastAge < 120
          ? 0.75
          : lastAge < 600
            ? 0.4
            : 0.18;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;

  const R_RING = 92;
  const RING_STROKE = 5;
  const R_MAX = R_RING - RING_STROKE / 2;
  const R_MIN = 20;
  const START = 0;

  const steps = contact.steps;
  const n = Math.max(3, steps.length);

  // Live: tiny breathe on polygon radii so surface “works”
  const breath = live ? 1 + 0.012 * Math.sin((now / 1000) * 2.2) : 1;

  const radii = useMemo(
    () =>
      steps.map(
        (s) =>
          (R_MIN + Math.max(0, Math.min(1, s.score)) * (R_MAX - R_MIN)) * breath
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, breath, R_MAX]
  );

  const poly = useMemo(
    () => polygonPoints(cx, cy, radii, START),
    [cx, cy, radii]
  );

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
    [cx, cy, n, R_MAX]
  );

  const circumference = 2 * Math.PI * R_RING;
  const dash = (Math.max(0, Math.min(100, contact.overall)) / 100) * circumference;
  const active = live && hashrateHs > 0;
  const ready =
    readiness != null && Number.isFinite(readiness)
      ? Math.max(0, Math.min(100, readiness))
      : contact.overall;
  const readyR = R_RING - 10;
  const readyC = 2 * Math.PI * readyR;
  const readyDash = (ready / 100) * readyC;
  const evtVis =
    evt24h != null && evt24h > 0
      ? Math.min(1, Math.log10(evt24h * 1e12 + 1) / 12)
      : 0;

  return (
    <div
      className={`relative w-full flex flex-col items-center ${
        active ? "" : "opacity-75 grayscale-[0.35]"
      }`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[260px] h-auto"
        role="img"
        aria-label={`Source contact ${contact.overall.toFixed(0)} percent ${
          active ? "live" : "offline"
        }`}
      >
        <defs>
          <linearGradient id={`srcFill-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id={`srcStroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <radialGradient id={`hubGlow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="#fbbf24"
              stopOpacity={active ? 0.35 : 0.08}
            />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft hub glow when live */}
        <circle cx={cx} cy={cy} r={48} fill={`url(#hubGlow-${uid})`} />

        {/* Outer contact ring */}
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
          stroke={`url(#srcStroke-${uid})`}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
          transform={`rotate(${-90 + (active ? spin * 0.35 : 0)} ${cx} ${cy})`}
          style={{
            filter:
              contact.overall >= 90 && active
                ? "drop-shadow(0 0 8px rgba(16,185,129,0.7))"
                : active
                  ? "drop-shadow(0 0 5px rgba(245,158,11,0.35))"
                  : undefined,
            transition: active ? undefined : "transform 0.4s ease",
          }}
        />

        {/* Rotating sweep arm — only when live */}
        {active && (
          <g transform={`rotate(${spin} ${cx} ${cy})`}>
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - R_RING + 4}
              stroke="#fbbf24"
              strokeWidth="1.5"
              opacity="0.55"
              strokeLinecap="round"
            />
            <circle
              cx={cx}
              cy={cy - R_RING + 4}
              r="3"
              fill="#fbbf24"
              opacity="0.85"
            >
              <animate
                attributeName="opacity"
                values="0.4;1;0.4"
                dur="1.2s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        )}

        {/* Faint orbit guide */}
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

        {/* Live polygon */}
        <polygon
          points={poly}
          fill={`url(#srcFill-${uid})`}
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ opacity: 0.28 + freshness * 0.5 }}
        />

        {/* Vertices */}
        {steps.map((s, i) => {
          const ang = axisAngle(i, n, START);
          const p = polar(cx, cy, radii[i], ang);
          const tip = polar(cx, cy, R_MAX, ang);
          const on = s.status === "on";
          const full = s.score >= 0.995;
          return (
            <g key={s.id}>
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
              {on && active && (
                <circle cx={p.x} cy={p.y} r="8" fill="#10b981" opacity="0.25">
                  <animate
                    attributeName="r"
                    values="6;12;6"
                    dur={`${flowSec}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.45;0.12;0.45"
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
              />
            </g>
          );
        })}

        {/* Inner readiness arc (v2.5) */}
        <circle
          cx={cx}
          cy={cy}
          r={readyR}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3.5"
          opacity="0.35"
        />
        <circle
          cx={cx}
          cy={cy}
          r={readyR}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${readyDash} ${Math.max(0, readyC - readyDash)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={active ? 0.85 : 0.3}
          className="transition-all duration-700"
        />

        {/* Center: contact + readiness */}
        <circle
          cx={cx}
          cy={cy}
          r="30"
          fill="var(--bg)"
          stroke={
            active
              ? ready >= 90
                ? "#10b981"
                : ready >= 55
                  ? "#f59e0b"
                  : "var(--border)"
              : "var(--border)"
          }
          strokeWidth="2"
        />
        {active && (
          <circle
            cx={cx}
            cy={cy}
            r="30"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1"
            opacity="0.5"
            strokeDasharray="6 8"
            transform={`rotate(${-spin * 1.4} ${cx} ${cy})`}
          />
        )}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-[var(--fg)]"
          style={{
            fontSize: "15px",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
          }}
        >
          {contact.overall.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          style={{
            fontSize: "8px",
            fill: active ? "#fbbf24" : "var(--muted)",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
          }}
        >
          R {ready.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          style={{
            fontSize: "7px",
            fill: active ? "#10b981" : "var(--muted)",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
          }}
        >
          {!active
            ? "OFF"
            : ready >= 90
              ? "HOT"
              : contact.touching
                ? "LIVE"
                : "RUN"}
        </text>

        {/* Hash particles along every axis when live */}
        {active &&
          steps.map((_, ai) => {
            const ang = axisAngle(ai, n, START);
            const p0 = polar(cx, cy, R_MIN + 4, ang);
            const p1 = polar(cx, cy, R_MAX - 2, ang);
            const count = Math.min(3, Math.max(1, Math.round(th) || 1));
            return Array.from({ length: count }).map((__, i) => (
              <circle
                key={`${ai}-${i}`}
                r="1.8"
                fill="#fbbf24"
                opacity="0.85"
              >
                <animate
                  attributeName="cx"
                  values={`${p0.x};${p1.x}`}
                  dur={`${flowSec}s`}
                  begin={`${(i * flowSec) / count + ai * 0.12}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  values={`${p0.y};${p1.y}`}
                  dur={`${flowSec}s`}
                  begin={`${(i * flowSec) / count + ai * 0.12}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.95;0"
                  dur={`${flowSec}s`}
                  begin={`${(i * flowSec) / count + ai * 0.12}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ));
          })}
      </svg>

      <div className="w-full grid grid-cols-3 gap-1.5 mt-1">
        {steps.map((s) => (
          <StepChip key={s.id} step={s} locale={locale} live={active} />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center leading-relaxed max-w-sm">
        {!active
          ? locale === "ko"
            ? "대기 · 보드 실시간 연결 시 접촉 레이더가 가동됩니다"
            : "Idle · radar runs when board is live"
          : locale === "ko"
            ? `가동 · 접촉 ${contact.overall.toFixed(0)}% · Ready ${ready.toFixed(0)}%${
                evtVis > 0 ? ` · EVT≈${(evt24h! * 100).toExponential(1)}%` : ""
              } · ${th.toFixed(2)} TH/s`
            : `Active · contact ${contact.overall.toFixed(0)}% · Ready ${ready.toFixed(0)}%${
                evtVis > 0 ? ` · EVT≈${(evt24h! * 100).toExponential(1)}%` : ""
              } · ${th.toFixed(2)} TH/s`}
      </p>
    </div>
  );
}

function StepChip({
  step,
  locale,
  live,
}: {
  step: SourceStep;
  locale: Locale;
  live: boolean;
}) {
  const bg =
    step.status === "on"
      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
      : step.status === "partial"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
        : "border-[var(--border)] text-[var(--muted)]";
  return (
    <div
      className={`rounded-lg border px-1.5 py-1 text-center min-w-0 ${bg} ${
        live && step.status === "on" ? "animate-pulse" : ""
      }`}
    >
      <div className="text-[9px] font-semibold truncate">
        {pick(locale, step.title)}
      </div>
      <div className="text-[10px] font-mono tabular-nums">
        {(step.score * 100).toFixed(0)}%
      </div>
    </div>
  );
}
