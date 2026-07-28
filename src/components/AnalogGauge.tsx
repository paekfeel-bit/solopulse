"use client";

/** Retro car-dashboard style analog gauge */
export function AnalogGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  warnAt,
  dangerAt,
  size = 140,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  warnAt?: number;
  dangerAt?: number;
  size?: number;
}) {
  const v = Number.isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  // sweep from -120deg to +120deg
  const angle = -120 + pct * 240;
  const color =
    dangerAt != null && v >= dangerAt
      ? "#ef4444"
      : warnAt != null && v >= warnAt
        ? "#f59e0b"
        : "#34d399";

  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const toXY = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const [nx, ny] = toXY(angle, r - 8);

  // arc path
  const start = toXY(-120);
  const end = toXY(120);
  const large = 0;
  const arc = `M ${start[0]} ${start[1]} A ${r} ${r} 0 ${large} 1 ${end[0]} ${end[1]}`;

  return (
    <div className="flex flex-col items-center select-none">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.82}`}>
        <defs>
          <radialGradient id="bezel" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="70%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r + 6} fill="url(#bezel)" stroke="#52525b" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={r} fill="#0c0a09" stroke="#44403c" strokeWidth="1" />
        <path d={arc} fill="none" stroke="#292524" strokeWidth="8" strokeLinecap="round" />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${pct * 250} 250`}
          filter="url(#glow)"
          opacity={0.9}
        />
        {/* ticks */}
        {Array.from({ length: 9 }).map((_, i) => {
          const d = -120 + (i / 8) * 240;
          const [x1, y1] = toXY(d, r - 2);
          const [x2, y2] = toXY(d, r - (i % 2 === 0 ? 12 : 8));
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
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transition: "all 0.4s ease-out" }}
        />
        <circle cx={cx} cy={cy} r={5} fill="#fafaf9" stroke={color} strokeWidth="2" />
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fill="#e7e5e4"
          fontSize="13"
          fontFamily="ui-monospace, monospace"
          fontWeight="700"
        >
          {Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : "—"}
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
