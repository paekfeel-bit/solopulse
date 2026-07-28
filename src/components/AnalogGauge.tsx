"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Ferrari-inspired analog cluster gauge.
 * Black carbon face · yellow/white ticks · red danger arc · yellow-red needle.
 * Spring needle + optional micro live wobble (0.1 unit sensitivity).
 */
export function AnalogGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  warnAt,
  dangerAt,
  size = 148,
  live = true,
  decimals,
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
  const uid = useId().replace(/:/g, "");
  const target = Number.isFinite(value) ? value : min;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const targetRef = useRef(target);
  const velRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const t = targetRef.current;
      let cur = displayRef.current;
      const stiffness = 0.24;
      const damping = 0.7;
      let vel = velRef.current;
      vel = (vel + (t - cur) * stiffness) * damping;
      if (Math.abs(t - cur) < 0.0005 && Math.abs(vel) < 0.0005) {
        cur = t;
        vel = 0;
      } else {
        cur += vel;
      }
      let shown = cur;
      if (live && t > min) {
        const wobbleAmp = Math.max(0.04, Math.min(0.12, Math.abs(t) * 0.00002 + 0.05));
        const phase = Date.now() / 1000;
        const wobble =
          Math.sin(phase * 2.7) * wobbleAmp * 0.55 +
          Math.sin(phase * 5.1 + 1.3) * wobbleAmp * 0.35 +
          Math.sin(phase * 11.0) * wobbleAmp * 0.15;
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

  const { scaleMin, scaleMax } = useMemo(() => {
    if (!sensitiveScale || !(target > 0)) {
      return { scaleMin: min, scaleMax: Math.max(max, min + 1e-6) };
    }
    const half = Math.max(Math.abs(target) * 0.12, (max - min) * 0.08, 8);
    const lo = Math.max(min, target - half);
    let hi = Math.max(lo + 1e-6, target + half);
    hi = Math.min(Math.max(hi, max * 0.5), Math.max(max, target * 1.2));
    return { scaleMin: lo, scaleMax: hi };
  }, [sensitiveScale, target, min, max]);

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
  // Ferrari cluster: ~240° sweep, redline on the right
  const START = -125;
  const SWEEP = 250;
  const angle = START + pct * SWEEP;

  const warnPct =
    warnAt != null
      ? Math.max(0, Math.min(1, (warnAt - animMin) / span))
      : 0.72;
  const dangerPct =
    dangerAt != null
      ? Math.max(0, Math.min(1, (dangerAt - animMin) / span))
      : 0.85;

  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const toXY = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const arcPath = (fromDeg: number, toDeg: number, rad: number) => {
    const [x1, y1] = toXY(fromDeg, rad);
    const [x2, y2] = toXY(toDeg, rad);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`;
  };

  const track = arcPath(START, START + SWEEP, r - 4);
  const greenEnd = START + Math.min(warnPct, 1) * SWEEP;
  const yellowEnd = START + Math.min(Math.max(dangerPct, warnPct), 1) * SWEEP;
  const redEnd = START + SWEEP;

  const dec =
    decimals != null
      ? decimals
      : Math.abs(target) >= 10000
        ? 0
        : 1;

  const text =
    Number.isFinite(v)
      ? Math.abs(v) >= 10000
        ? v.toFixed(0)
        : v.toFixed(dec)
      : "—";

  const needleColor =
    dangerAt != null && target >= dangerAt
      ? "#ef4444"
      : warnAt != null && target >= warnAt
        ? "#fbbf24"
        : "#facc15";

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width={size}
        height={size * 0.82}
        viewBox={`0 0 ${size} ${size * 0.86}`}
        className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
      >
        <defs>
          {/* Carbon / piano black face */}
          <radialGradient id={`face-${uid}`} cx="42%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#2a2a2e" />
            <stop offset="45%" stopColor="#121214" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <linearGradient id={`bezel-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b7280" />
            <stop offset="35%" stopColor="#1f1f23" />
            <stop offset="70%" stopColor="#9ca3af" />
            <stop offset="100%" stopColor="#111113" />
          </linearGradient>
          <linearGradient id={`rim-y-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a16207" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#a16207" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`soft-${uid}`}>
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Outer chrome bezel */}
        <circle
          cx={cx}
          cy={cy}
          r={r + 9}
          fill={`url(#bezel-${uid})`}
          stroke="#0a0a0a"
          strokeWidth="1"
        />
        {/* Yellow pulse ring (Ferrari yellow accent) */}
        <circle
          cx={cx}
          cy={cy}
          r={r + 7.2}
          fill="none"
          stroke={`url(#rim-y-${uid})`}
          strokeWidth="1.4"
          opacity="0.85"
        />
        {/* Inner black face */}
        <circle
          cx={cx}
          cy={cy}
          r={r + 1}
          fill={`url(#face-${uid})`}
          stroke="#1c1917"
          strokeWidth="2"
        />
        {/* Subtle inner vignette ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r - 2}
          fill="none"
          stroke="#000"
          strokeWidth="6"
          opacity="0.35"
        />

        {/* Track base */}
        <path
          d={track}
          fill="none"
          stroke="#1c1917"
          strokeWidth="7"
          strokeLinecap="butt"
        />
        {/* Green / normal zone */}
        <path
          d={arcPath(START, greenEnd, r - 4)}
          fill="none"
          stroke="#22c55e"
          strokeWidth="5"
          strokeLinecap="butt"
          opacity="0.75"
        />
        {/* Yellow warn */}
        {yellowEnd > greenEnd && (
          <path
            d={arcPath(greenEnd, yellowEnd, r - 4)}
            fill="none"
            stroke="#eab308"
            strokeWidth="5"
            strokeLinecap="butt"
            opacity="0.9"
          />
        )}
        {/* Redline */}
        {redEnd > yellowEnd && (
          <path
            d={arcPath(yellowEnd, redEnd, r - 4)}
            fill="none"
            stroke="#dc2626"
            strokeWidth="6"
            strokeLinecap="butt"
            opacity="0.95"
            filter={`url(#glow-${uid})`}
          />
        )}
        {/* Value arc (thin yellow) */}
        <path
          d={arcPath(START, START + pct * SWEEP, r - 4)}
          fill="none"
          stroke="#fde047"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Ticks — Ferrari style dense marks */}
        {Array.from({ length: 26 }).map((_, i) => {
          const d = START + (i / 25) * SWEEP;
          const major = i % 5 === 0;
          const [x1, y1] = toXY(d, r - 8);
          const [x2, y2] = toXY(d, r - (major ? 18 : 12));
          const hot = d >= yellowEnd;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={hot ? "#f87171" : major ? "#fafafa" : "#a8a29e"}
              strokeWidth={major ? 1.8 : 1}
              opacity={major ? 0.95 : 0.55}
            />
          );
        })}

        {/* Needle shadow */}
        <g transform={`rotate(${angle} ${cx} ${cy})`} opacity="0.35">
          <polygon
            points={`${cx - 2.2},${cy + 10} ${cx + 2.2},${cy + 10} ${cx},${cy - (r - 16)}`}
            fill="#000"
            filter={`url(#soft-${uid})`}
          />
        </g>
        {/* Ferrari needle — yellow/red blade */}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <polygon
            points={`${cx - 2},${cy + 12} ${cx + 2},${cy + 12} ${cx + 0.6},${cy - (r - 14)} ${cx - 0.6},${cy - (r - 14)}`}
            fill={needleColor}
            filter={`url(#glow-${uid})`}
          />
          <line
            x1={cx}
            y1={cy + 8}
            x2={cx}
            y2={cy - (r - 18)}
            stroke="#fff7ed"
            strokeWidth="0.6"
            opacity="0.7"
          />
        </g>
        {/* Hub */}
        <circle cx={cx} cy={cy} r={8} fill="#0a0a0a" stroke="#facc15" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={3.5} fill="#fde047" opacity="0.95" />

        {/* Digital LCD strip */}
        <rect
          x={cx - 32}
          y={cy + 18}
          width={64}
          height={18}
          rx={3}
          fill="#050505"
          stroke="#292524"
          strokeWidth="1"
        />
        <text
          x={cx}
          y={cy + 31}
          textAnchor="middle"
          fill="#fde047"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          fontWeight="700"
          letterSpacing="0.5"
        >
          {text}
          <tspan fill="#a8a29e" fontSize="7">
            {" "}
            {unit}
          </tspan>
        </text>
      </svg>
      <div className="text-[9px] uppercase tracking-[0.28em] text-amber-600/90 font-semibold -mt-0.5">
        {label}
      </div>
    </div>
  );
}
