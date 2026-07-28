"use client";

import { useEffect, useMemo, useState } from "react";
import type { MechanismSynthesis } from "@/lib/mechanismEngine";
import { useI18n } from "@/lib/i18n";

/**
 * Dynamic max-engine core visualization.
 * Motion parameters derived only from real: h, D, best, consensus, sim rates, slot.
 */
export function EngineCore({
  synth,
  slot,
  secSinceBlock,
}: {
  synth: MechanismSynthesis;
  slot: number;
  secSinceBlock: number;
}) {
  const { locale } = useI18n();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  const th = synth.hashrateHs / 1e12;
  const spinSec = Math.max(4, Math.min(28, 40 / Math.max(0.2, th))); // faster spin if more HR
  const orbitDots = Math.min(16, Math.max(4, Math.round(th * 3 + synth.consensus * 4)));
  const pulse = 0.85 + 0.15 * Math.sin(tick * 0.15 + slot * 3);

  const methods = synth.methods;
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;

  // Six method nodes on a shared circle (same polar system as rings)
  // angle 0° = top; nodes sit ON the consensus-adjacent orbit so beams meet cleanly
  const NODE_R = 92;
  const nodes = useMemo(
    () =>
      methods.map((m, i) => {
        const n = Math.max(1, methods.length);
        // 0° at top (12 o'clock), clockwise
        const angDeg = -90 + (i * 360) / n;
        const a = (angDeg * Math.PI) / 180;
        return {
          m,
          x: cx + NODE_R * Math.cos(a),
          y: cy + NODE_R * Math.sin(a),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [methods.map((m) => `${m.id}:${m.supportsConclusion.toFixed(3)}`).join("|"), cx, cy]
  );

  const ringDash = 2 * Math.PI * 70;
  const ringFill = (synth.consensus * ringDash).toFixed(1);

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] drop-shadow-lg">
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.55 * pulse} />
            <stop offset="55%" stopColor="#f97316" stopOpacity={0.2 * pulse} />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id="blurSoft">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Outer glow */}
        <circle cx={cx} cy={cy} r={110} fill="url(#coreGlow)" />

        {/* Rotating dashed ring — speed ∝ hashrate */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: `engineSpin ${spinSec}s linear infinite` }}>
          <circle
            cx={cx}
            cy={cy}
            r={102}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.2"
            strokeDasharray="4 10"
            opacity="0.45"
          />
        </g>
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: `engineSpin ${spinSec * 1.6}s linear infinite reverse`,
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={108}
            fill="none"
            stroke="#34d399"
            strokeWidth="0.8"
            strokeDasharray="2 14"
            opacity="0.35"
          />
        </g>

        {/* Consensus ring */}
        <circle cx={cx} cy={cy} r={70} fill="none" stroke="var(--border)" strokeWidth="8" opacity="0.5" />
        <circle
          cx={cx}
          cy={cy}
          r={70}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${ringFill} ${ringDash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-1000"
          style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.45))" }}
        />

        {/* Orbiting hash particles — count ∝ TH */}
        {Array.from({ length: orbitDots }).map((_, i) => {
          const dur = spinSec * (0.65 + (i % 4) * 0.12);
          const rOrbit = 74 + (i % 3) * 6;
          return (
            <circle key={i} r={1.6 + (i % 3) * 0.35} fill="#fbbf24" opacity="0.8">
              <animateMotion
                dur={`${dur}s`}
                begin={`${(i / orbitDots) * dur}s`}
                repeatCount="indefinite"
                path={`M ${cx + rOrbit} ${cy} A ${rOrbit} ${rOrbit} 0 1 1 ${cx + rOrbit - 0.01} ${cy}`}
              />
            </circle>
          );
        })}

        {/* Method nodes + beams to core */}
        {nodes.map(({ m, x, y }, i) => {
          const on = m.supportsConclusion >= 0.85;
          return (
            <g key={m.id}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={on ? "#f59e0b" : "#52525b"}
                strokeWidth={on ? 1.4 : 0.8}
                opacity={0.25 + m.supportsConclusion * 0.55}
              >
                {on && (
                  <animate
                    attributeName="opacity"
                    values="0.3;0.85;0.3"
                    dur={`${1.2 + i * 0.15}s`}
                    repeatCount="indefinite"
                  />
                )}
              </line>
              <circle
                cx={x}
                cy={y}
                r={7 + m.supportsConclusion * 4}
                fill={on ? "#f59e0b22" : "#27272a"}
                stroke={on ? "#fbbf24" : "#52525b"}
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                style={{ fontSize: "8px", fill: on ? "#fde68a" : "#a1a1aa", fontFamily: "monospace" }}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Core */}
        <circle cx={cx} cy={cy} r={36 * pulse} fill="#18181b" stroke="#f59e0b" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={28} fill="#0a0a0a" stroke="#34d399" strokeWidth="1" opacity="0.9" />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          style={{ fontSize: "20px", fontWeight: 700, fill: "#fafafa", fontFamily: "ui-monospace, monospace" }}
        >
          {(synth.consensus * 100).toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          style={{ fontSize: "8px", fill: "#a1a1aa", fontFamily: "system-ui" }}
        >
          ENGINE
        </text>
      </svg>

      {/* Live readouts under core */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px] -mt-1">
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5">
          <div className="text-[8px] text-[var(--muted)] uppercase">slot</div>
          <div className="text-xs font-mono font-bold text-amber-500">
            {(Math.min(1, slot) * 100).toFixed(0)}%
          </div>
          <div className="text-[8px] font-mono text-[var(--muted)]">{secSinceBlock}s</div>
        </div>
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5">
          <div className="text-[8px] text-[var(--muted)] uppercase">MC 1y</div>
          <div className="text-xs font-mono font-bold text-orange-400">
            {((synth.sim.hitsIn1y / synth.sim.trials) * 100).toFixed(3)}%
          </div>
          <div className="text-[8px] font-mono text-[var(--muted)]">
            {synth.sim.hitsIn1y}/{synth.sim.trials}
          </div>
        </div>
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5">
          <div className="text-[8px] text-[var(--muted)] uppercase">vs min win</div>
          <div className="text-xs font-mono font-bold text-emerald-400">
            {synth.trackableSource.relativeToWeakestWinner.toFixed(1)}×
          </div>
          <div className="text-[8px] font-mono text-[var(--muted)]">tickets</div>
        </div>
      </div>

      <p className="mt-2 text-[9px] text-center text-[var(--muted)] max-w-xs leading-relaxed">
        {locale === "ko"
          ? "코어 회전·입자 수 ∝ 실측 해시. 빔 강도 ∝ 각 공략 합의도. 장식용 난수 없음."
          : locale === "ja"
            ? "回転・粒子∝実測ハッシュ。ビーム∝各手法の合意。装飾乱数なし。"
            : "Spin & particles ∝ live hashrate. Beams ∝ method consensus. No cosmetic RNG."}
      </p>
    </div>
  );
}
