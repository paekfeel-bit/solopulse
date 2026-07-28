"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Retro car-dashboard analog gauge.
 * - Smooth spring needle (sensitive to 0.1 unit target changes)
 * - Optional micro live wobble so it never looks frozen between polls
 * - Digital readout at 0.1 resolution (or finer for small values)
 */
export function AnalogGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  warnAt,
  dangerAt,
  size = 140,
  /** Keep needle slightly alive between data ticks */
  live = true,
  /** Decimal places for readout (default: 1 for 0.1 sensitivity) */
  decimals,
  /** Auto-zoom scale around current value for finer needle motion */
  sensitiveScale = false,
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
  sensitiveScale?: boolean;
}) {
  const target = Number.isFinite(value) ? value : min;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const targetRef = useRef(target);
  const velRef = useRef(0);
  const rafRef = useRef(0);

  // Track target immediately
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  // Spring toward target + optional micro wobble (rAF ~60fps)
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const t = targetRef.current;
      let cur = displayRef.current;
      // critically-damped-ish spring (snappy, settles on 0.1 deltas)
      const stiffness = 0.22;
      const damping = 0.72;
      let vel = velRef.current;
      const force = (t - cur) * stiffness;
      vel = (vel + force) * damping;
      // snap when extremely close so 0.1 steps don't ring forever
      if (Math.abs(t - cur) < 0.0005 && Math.abs(vel) < 0.0005) {
        cur = t;
        vel = 0;
      } else {
        cur += vel;
      }
      // live micro-wobble: ±~0.08 around settled value (feels analog, still follows 0.1)
      let shown = cur;
      if (live && t > min) {
        const wobbleAmp = Math.max(0.04, Math.min(0.12, Math.abs(t) * 0.00002 + 0.05));
        const phase = Date.now() / 1000;
        // multi-frequency for less regular "machine" feel
        const wobble =
          Math.sin(phase * 2.7) * wobbleAmp * 0.55 +
          Math.sin(phase * 5.1 + 1.3) * wobbleAmp * 0.35 +
          Math.sin(phase * 11.0) * wobbleAmp * 0.15;
        // only wobble once near target so big jumps still animate cleanly
        if (Math.abs(t - cur) < Math.max(0.5, Math.abs(t) * 0.002)) {
          shown = cur + wobble;
        }
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
  }, [live, min]);

  // Adaptive scale: zoom around value so 0.1 units move the needle more
  const { scaleMin, scaleMax } = useMemo(() => {
    if (!sensitiveScale || !(target > 0)) {
      return { scaleMin: min, scaleMax: Math.max(max, min + 1e-6) };
    }
    // window ±12% around value (at least ±8 units for hashrate GH/s feel)
    const half = Math.max(Math.abs(target) * 0.12, (max - min) * 0.08, 8);
    const lo = Math.max(min, target - half);
    let hi = Math.max(lo + 1e-6, target + half);
    // never exceed original max by too much
    hi = Math.min(Math.max(hi, max * 0.5), Math.max(max, target * 1.2));
    return { scaleMin: lo, scaleMax: hi };
  }, [sensitiveScale, target, min, max]);

  // Smooth scale edges so zoom doesn't jump
  const [animMin, setAnimMin] = useState(scaleMin);
  const [animMax, setAnimMax] = useState(scaleMax);
  useEffect(() => {
    const id = window.setInterval(() => {
      setAnimMin((m) => m + (scaleMin - m) * 0.08);
      setAnimMax((m) => m + (scaleMax - m) * 0.08);
    }, 50);
    return () => clearInterval(id);
  }, [scaleMin, scaleMax]);

  const v = display;
  const span = animMax - animMin || 1;
  const pct = Math.max(0, Math.min(1, (v - animMin) / span));
  // sweep from -120deg to +120deg
  const angle = -120 + pct * 240;
  const color =
    dangerAt != null && target >= dangerAt
      ? "#ef4444"
      : warnAt != null && target >= warnAt
        ? "#f59e0b"
        : "#34d399";

  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const toXY = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };

  const start = toXY(-120);
  const end = toXY(120);
  const arc = `M ${start[0]} ${start[1]} A ${r} ${r} 0 0 1 ${end[0]} ${end[1]}`;

  const dec =
    decimals != null
      ? decimals
      : Math.abs(target) >= 1000
        ? 1
        : Math.abs(target) >= 100
          ? 1
          : 1;

  const text =
    Number.isFinite(v)
      ? Math.abs(v) >= 10000
        ? v.toFixed(0)
        : v.toFixed(dec)
      : "—";

  return (
    <div className="flex flex-col items-center select-none">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.82}`}>
        <defs>
          <radialGradient id={`bezel-${label}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="70%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r + 6}
          fill={`url(#bezel-${label})`}
          stroke="#52525b"
          strokeWidth="2"
        />
        <circle cx={cx} cy={cy} r={r} fill="#0c0a09" stroke="#44403c" strokeWidth="1" />
        <path d={arc} fill="none" stroke="#292524" strokeWidth="8" strokeLinecap="round" />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${pct * 250} 250`}
          filter={`url(#glow-${label})`}
          opacity={0.9}
          style={{ transition: "stroke 0.25s ease" }}
        />
        {Array.from({ length: 13 }).map((_, i) => {
          const d = -120 + (i / 12) * 240;
          const [x1, y1] = toXY(d, r - 2);
          const [x2, y2] = toXY(d, r - (i % 2 === 0 ? 12 : 7));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#a8a29e"
              strokeWidth={i % 2 === 0 ? 1.5 : 1}
              opacity={0.7}
            />
          );
        })}
        {/* Needle rotates via transform — GPU smooth, reacts to 0.1 steps */}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line
            x1={cx}
            y1={cy + 6}
            x2={cx}
            y2={cy - (r - 10)}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <polygon
            points={`${cx - 2},${cy - (r - 14)} ${cx + 2},${cy - (r - 14)} ${cx},${cy - (r - 6)}`}
            fill={color}
            opacity={0.95}
          />
        </g>
        <circle cx={cx} cy={cy} r={5.5} fill="#fafaf9" stroke={color} strokeWidth="2" />
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          fill="#e7e5e4"
          fontSize="12"
          fontFamily="ui-monospace, monospace"
          fontWeight="700"
        >
          {text}
          <tspan fill="#a8a29e" fontSize="9">
            {" "}
            {unit}
          </tspan>
        </text>
      </svg>
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 -mt-1">
        {label}
      </div>
    </div>
  );
}
