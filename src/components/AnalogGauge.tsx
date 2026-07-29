"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatGaugeTick } from "@/lib/gaugeScale";

/**
 * Classic analog instrument — perfect circular dial.
 * Cream face · brass bezel · red needle · spring motion.
 * Scale is full range (min→max); tick labels spaced to avoid overlap.
 */
export function AnalogGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  warnAt,
  dangerAt,
  size = 156,
  live = true,
  decimals,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  warnAt?: number;
  dangerAt?: number;
  size?: number;
  live?: boolean;
  decimals?: number;
  /** @deprecated kept for call-site compat — full device scale preferred */
  sensitiveScale?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const target = Number.isFinite(value) ? value : min;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const targetRef = useRef(target);
  const velRef = useRef(0);
  const rafRef = useRef(0);

  // Stable full-scale bounds (device scale from parent)
  const scaleMin = min;
  const scaleMax = Math.max(max, min + 1e-6);
  const scaleMinRef = useRef(scaleMin);
  const scaleMaxRef = useRef(scaleMax);
  scaleMinRef.current = scaleMin;
  scaleMaxRef.current = scaleMax;

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const t = targetRef.current;
      let cur = displayRef.current;
      let vel = velRef.current;
      vel = (vel + (t - cur) * 0.28) * 0.66;
      if (Math.abs(t - cur) < 0.0005 && Math.abs(vel) < 0.0005) {
        cur = t;
        vel = 0;
      } else cur += vel;
      let shown = cur;
      // Always micro-wobble when live so needles never look frozen
      if (live) {
        const span = Math.max(
          1e-6,
          scaleMaxRef.current - scaleMinRef.current
        );
        // ~0.35–0.9% of full scale — visible but still “instrument” fine
        const amp = span * 0.0055;
        const ph = Date.now() / 1000;
        const base = Math.abs(t - cur) < span * 0.02 ? cur : cur;
        shown =
          base +
          Math.sin(ph * 2.8) * amp * 0.55 +
          Math.sin(ph * 6.1) * amp * 0.3 +
          Math.sin(ph * 13.7) * amp * 0.15;
      }
      velRef.current = vel;
      displayRef.current = cur;
      setDisplay(shown);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [live]);

  const v = display;
  const span = scaleMax - scaleMin || 1;
  const pct = Math.max(0, Math.min(1, (v - scaleMin) / span));
  const START = -120;
  const SWEEP = 240;
  const angle = START + pct * SWEEP;

  const warnPct =
    warnAt != null ? Math.max(0, Math.min(1, (warnAt - scaleMin) / span)) : 0.72;
  const dangerPct =
    dangerAt != null
      ? Math.max(0, Math.min(1, (dangerAt - scaleMin) / span))
      : 0.86;

  const pad = 3;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - pad;
  const r = outerR - 10;

  const toXY = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const arcPath = (from: number, to: number, rad: number) => {
    const [x1, y1] = toXY(from, rad);
    const [x2, y2] = toXY(to, rad);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`;
  };

  const greenEnd = START + Math.min(warnPct, 1) * SWEEP;
  const yellowEnd = START + Math.min(Math.max(dangerPct, warnPct), 1) * SWEEP;
  const redEnd = START + SWEEP;

  const dec =
    decimals != null
      ? decimals
      : Math.abs(target) >= 100
        ? 0
        : Math.abs(target) >= 10
          ? 1
          : 2;
  const text = Number.isFinite(v)
    ? Math.abs(v) >= 1000
      ? v.toFixed(0)
      : v.toFixed(dec)
    : "—";

  // 5 major labels only (0 · 25 · 50 · 75 · 100%) — even spacing, no pile-up
  const majorCount = 4;
  const labels = Array.from({ length: majorCount + 1 }, (_, i) => {
    const p = i / majorCount;
    const val = scaleMin + p * span;
    const deg = START + p * SWEEP;
    // Keep scale numbers on the arc ring; ends stay slightly higher so readout below stays clear
    const nearEnd = i === 0 || i === majorCount;
    const labelR = nearEnd ? r - 28 : r - 22;
    const [lx, ly] = toXY(deg, labelR);
    return { val, lx, ly, deg };
  });

  const screwR = r + 6.5;
  const screws = [45, 135, 225, 315].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: cx + screwR * Math.cos(a), y: cy + screwR * Math.sin(a) };
  });

  const tickLabelSize = size < 150 ? 7 : size < 170 ? 7.5 : 8.5;
  const valueSize = size < 150 ? 11 : size < 170 ? 12.5 : 14;
  // Same style as before — only nudged slightly down to clear scale marks
  const readoutY = cy + r * 0.54;

  return (
    <div className="flex flex-col items-center select-none gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
      >
        <defs>
          <radialGradient id={`cream-${uid}`} cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#f7f1e4" />
            <stop offset="40%" stopColor="#e9dfc8" />
            <stop offset="75%" stopColor="#d4c4a8" />
            <stop offset="100%" stopColor="#b8a686" />
          </radialGradient>
          <radialGradient id={`face-grain-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="70%" stopColor="#5c4a32" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#3f2e14" stopOpacity="0.08" />
          </radialGradient>
          <linearGradient id={`brass-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e8c99a" />
            <stop offset="25%" stopColor="#c9a227" />
            <stop offset="50%" stopColor="#8b6914" />
            <stop offset="75%" stopColor="#d4a574" />
            <stop offset="100%" stopColor="#5c4a1f" />
          </linearGradient>
          <linearGradient id={`brass-ring-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0d9a8" />
            <stop offset="35%" stopColor="#a67c2e" />
            <stop offset="65%" stopColor="#6b5420" />
            <stop offset="100%" stopColor="#d4b06a" />
          </linearGradient>
          <radialGradient id={`glass-${uid}`} cx="32%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
          </radialGradient>
          <filter id={`soft-${uid}`}>
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <circle cx={cx} cy={cy + 1.5} r={outerR} fill="#000" opacity="0.22" />

        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill={`url(#brass-ring-${uid})`}
          stroke="#2a1f0c"
          strokeWidth="1.1"
        />
        <circle cx={cx} cy={cy} r={outerR - 3.5} fill="#1a1510" stroke="#0a0806" strokeWidth="0.5" />
        <circle
          cx={cx}
          cy={cy}
          r={outerR - 5.5}
          fill={`url(#brass-${uid})`}
          stroke="#3f2e14"
          strokeWidth="0.7"
        />

        {screws.map((s, i) => (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r={2.4} fill="#6b5a3a" stroke="#2a2010" strokeWidth="0.55" />
            <circle cx={s.x} cy={s.y} r={1.7} fill={`url(#brass-${uid})`} />
            <line x1={s.x - 1.2} y1={s.y} x2={s.x + 1.2} y2={s.y} stroke="#2a2010" strokeWidth="0.5" />
            <line x1={s.x} y1={s.y - 1.2} x2={s.x} y2={s.y + 1.2} stroke="#2a2010" strokeWidth="0.5" />
          </g>
        ))}

        <circle cx={cx} cy={cy} r={r} fill={`url(#cream-${uid})`} stroke="#7a6a50" strokeWidth="1.3" />
        <circle cx={cx} cy={cy} r={r} fill={`url(#face-grain-${uid})`} />
        <circle cx={cx} cy={cy} r={r - 2.5} fill="none" stroke="#a89880" strokeWidth="0.65" opacity="0.65" />

        <path d={arcPath(START, greenEnd, r - 7)} fill="none" stroke="#15803d" strokeWidth="4.5" opacity="0.32" />
        {yellowEnd > greenEnd && (
          <path d={arcPath(greenEnd, yellowEnd, r - 7)} fill="none" stroke="#a16207" strokeWidth="4.5" opacity="0.42" />
        )}
        {redEnd > yellowEnd && (
          <path d={arcPath(yellowEnd, redEnd, r - 7)} fill="none" stroke="#991b1b" strokeWidth="5.5" opacity="0.5" />
        )}

        {/* Minor ticks only between majors — denser marks, no numbers */}
        {Array.from({ length: 41 }).map((_, i) => {
          const d = START + (i / 40) * SWEEP;
          const major = i % 10 === 0;
          const mid = i % 5 === 0;
          const [x1, y1] = toXY(d, r - 5);
          const [x2, y2] = toXY(d, r - (major ? 15 : mid ? 11 : 8));
          const hot = d >= yellowEnd;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={hot ? "#7f1d1d" : major ? "#1c1917" : "#57534e"}
              strokeWidth={major ? 1.6 : mid ? 1 : 0.6}
              opacity={major ? 0.95 : 0.55}
              strokeLinecap="round"
            />
          );
        })}

        {/* Scale numbers — compact, 5 only */}
        {labels.map((L, i) => (
          <text
            key={i}
            x={L.lx}
            y={L.ly + 2.5}
            textAnchor="middle"
            fill="#1c1917"
            fontSize={tickLabelSize}
            fontFamily="ui-monospace, 'Courier New', monospace"
            fontWeight="700"
            opacity="0.92"
          >
            {formatGaugeTick(L.val, unit)}
          </text>
        ))}

        <text
          x={cx}
          y={cy - r * 0.2}
          textAnchor="middle"
          fill="#78716c"
          fontSize={size < 160 ? 5.5 : 6.5}
          fontFamily="Georgia, serif"
          fontWeight="600"
          letterSpacing="1.2"
          opacity="0.45"
        >
          SOLOPULSE
        </text>

        {/* Needle */}
        <g transform={`rotate(${angle} ${cx} ${cy})`} opacity="0.28">
          <polygon
            points={`${cx - 2.4},${cy + 12} ${cx + 2.4},${cy + 12} ${cx},${cy - (r - 18)}`}
            fill="#000"
            filter={`url(#soft-${uid})`}
          />
        </g>
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <polygon
            points={`${cx - 2.1},${cy + 14} ${cx + 2.1},${cy + 14} ${cx + 0.75},${cy - (r - 16)} ${cx - 0.75},${cy - (r - 16)}`}
            fill="#9f1239"
          />
          <polygon
            points={`${cx - 0.45},${cy + 6} ${cx + 0.45},${cy + 6} ${cx},${cy - (r - 20)}`}
            fill="#fecdd3"
            opacity="0.9"
          />
          <rect
            x={cx - 2.8}
            y={cy + 8}
            width={5.6}
            height={7}
            rx={1}
            fill="#44403c"
            stroke="#1c1917"
            strokeWidth="0.5"
          />
        </g>

        <circle cx={cx} cy={cy} r={6.5} fill={`url(#brass-${uid})`} stroke="#3f2e14" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={3.5} fill="#292524" />
        <circle cx={cx} cy={cy} r={1.5} fill="#0c0a09" />

        <circle cx={cx} cy={cy} r={r - 0.5} fill={`url(#glass-${uid})`} />

        {/* Digital readout — original inline style, slightly lower */}
        <text
          x={cx}
          y={readoutY}
          textAnchor="middle"
          fill="#1c1917"
          fontSize={valueSize}
          fontFamily="ui-monospace, 'Courier New', monospace"
          fontWeight="700"
        >
          {text}
          <tspan fill="#44403c" fontSize={valueSize * 0.55} fontWeight="600">
            {" "}
            {unit}
          </tspan>
        </text>
      </svg>

      <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] font-bold leading-none text-center text-amber-800 dark:text-amber-500 drop-shadow-sm">
        {label}
      </div>
    </div>
  );
}
