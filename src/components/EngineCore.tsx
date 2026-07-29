"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { MechanismSynthesis } from "@/lib/mechanismEngine";
import { useI18n } from "@/lib/i18n";
import { formatHashrateGhs } from "@/lib/mining";

/**
 * MAX ENGINE core — v2.5
 * Center = Block Readiness · outer arcs = consensus / EVT · 7 method nodes
 */
export function EngineCore({
  synth,
  slot,
  secSinceBlock,
  live = true,
}: {
  synth: MechanismSynthesis;
  slot: number;
  secSinceBlock: number;
  live?: boolean;
}) {
  const { locale } = useI18n();
  const uid = useId().replace(/:/g, "");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [live]);

  const enh = synth.enhanced;
  const readiness = enh?.blockDetected
    ? 100
    : Math.max(0, Math.min(99.9, enh?.blockReadiness ?? synth.consensus * 100));
  const consensusPct = synth.consensus * 100;
  const evt24 = enh?.gumbel.pBlock24h ?? 0;
  const trend = enh?.gumbel.trendScore ?? 0.5;
  const accel = enh?.acceleration.score ?? 0.5;
  const retargetPct = enh?.retarget.changePct ?? 0;
  const blockDetected = !!enh?.blockDetected;

  const th = synth.hashrateHs / 1e12;
  // Spin: hashrate × readiness (readier → slightly faster “pressure”)
  const spinSec = live
    ? Math.max(
        3.5,
        Math.min(24, 36 / Math.max(0.2, th * (0.6 + readiness / 100)))
      )
    : 0;
  const orbitDots = Math.min(
    18,
    Math.max(4, Math.round(th * 3 + readiness / 12 + consensusPct / 20))
  );
  const pulse = live
    ? 0.82 + 0.18 * Math.sin(tick * 0.15 + slot * 3) * (0.5 + readiness / 200)
    : 0.55;

  const methods = synth.methods;
  const size = 270;
  const cx = size / 2;
  const cy = size / 2;
  const NODE_R = 96;

  const nodes = useMemo(
    () =>
      methods.map((m, i) => {
        const n = Math.max(1, methods.length);
        const angDeg = -90 + (i * 360) / n;
        const a = (angDeg * Math.PI) / 180;
        return {
          m,
          x: cx + NODE_R * Math.cos(a),
          y: cy + NODE_R * Math.sin(a),
          i,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [methods.map((m) => `${m.id}:${m.supportsConclusion.toFixed(3)}`).join("|"), cx, cy]
  );

  const ringC = 2 * Math.PI * 72;
  const readyFill = (readiness / 100) * ringC;
  const consC = 2 * Math.PI * 58;
  const consFill = (consensusPct / 100) * consC;
  const evtC = 2 * Math.PI * 84;
  // log-scale visual for tiny EVT probs
  const evtVis =
    evt24 > 0 ? Math.min(1, (Math.log10(evt24 * 1e12 + 1) / 12) * 0.85 + 0.08) : 0.04;
  const evtFill = evtVis * evtC;

  const coreColor = blockDetected
    ? "#10b981"
    : readiness >= 70
      ? "#fbbf24"
      : readiness >= 40
        ? "#f59e0b"
        : "#a8a29e";

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] drop-shadow-lg">
        <defs>
          <radialGradient id={`coreGlow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={blockDetected ? "#34d399" : "#fbbf24"}
              stopOpacity={0.5 * pulse}
            />
            <stop offset="55%" stopColor="#f97316" stopOpacity={0.18 * pulse} />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`readyGrad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id={`evtGrad-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        <circle cx={cx} cy={cy} r={118} fill={`url(#coreGlow-${uid})`} />

        {/* Outer spin (hashrate) */}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation:
              live && spinSec > 0
                ? `engineSpin ${spinSec}s linear infinite`
                : undefined,
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={108}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.2"
            strokeDasharray="4 10"
            opacity={live ? 0.45 : 0.2}
          />
        </g>

        {/* EVT proximity ring (purple→amber) */}
        <circle
          cx={cx}
          cy={cy}
          r={84}
          fill="none"
          stroke="var(--border)"
          strokeWidth="5"
          opacity="0.4"
        />
        <circle
          cx={cx}
          cy={cy}
          r={84}
          fill="none"
          stroke={`url(#evtGrad-${uid})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${evtFill} ${Math.max(0, evtC - evtFill)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={live ? 0.9 : 0.35}
          className="transition-all duration-1000"
        />

        {/* Readiness main ring */}
        <circle
          cx={cx}
          cy={cy}
          r={72}
          fill="none"
          stroke="var(--border)"
          strokeWidth="9"
          opacity="0.45"
        />
        <circle
          cx={cx}
          cy={cy}
          r={72}
          fill="none"
          stroke={`url(#readyGrad-${uid})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${readyFill} ${Math.max(0, ringC - readyFill)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-1000"
          style={{
            filter: blockDetected
              ? "drop-shadow(0 0 10px rgba(16,185,129,0.7))"
              : "drop-shadow(0 0 6px rgba(251,191,36,0.45))",
          }}
        />

        {/* Consensus inner ring */}
        <circle
          cx={cx}
          cy={cy}
          r={58}
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${consFill} ${Math.max(0, consC - consFill)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity="0.75"
          className="transition-all duration-1000"
        />

        {/* Orbit particles */}
        {Array.from({ length: orbitDots }).map((_, i) => {
          const dur = Math.max(0.5, (spinSec || 12) * (0.65 + (i % 4) * 0.12));
          const rOrbit = 78 + (i % 3) * 6;
          const ang = (i / orbitDots) * Math.PI * 2;
          const fx = cx + rOrbit * Math.cos(ang);
          const fy = cy + rOrbit * Math.sin(ang);
          return (
            <circle
              key={i}
              r={1.5 + (i % 3) * 0.35}
              fill={blockDetected ? "#34d399" : "#fbbf24"}
              opacity={live ? 0.85 : 0.22}
              cx={live ? undefined : fx}
              cy={live ? undefined : fy}
            >
              {live && (
                <animateMotion
                  dur={`${dur}s`}
                  begin={`${(i / orbitDots) * dur}s`}
                  repeatCount="indefinite"
                  path={`M ${cx + rOrbit} ${cy} A ${rOrbit} ${rOrbit} 0 1 1 ${cx + rOrbit - 0.01} ${cy}`}
                />
              )}
            </circle>
          );
        })}

        {/* 7 method nodes */}
        {nodes.map(({ m, x, y, i }) => {
          const isEvt = m.id === "evtReadiness";
          const on = m.supportsConclusion >= 0.85;
          return (
            <g key={m.id}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={isEvt ? "#a78bfa" : on ? "#f59e0b" : "#52525b"}
                strokeWidth={on || isEvt ? 1.5 : 0.8}
                opacity={0.25 + m.supportsConclusion * 0.55}
              >
                {live && (on || isEvt) && (
                  <animate
                    attributeName="opacity"
                    values="0.3;0.9;0.3"
                    dur={`${1.1 + i * 0.12}s`}
                    repeatCount="indefinite"
                  />
                )}
              </line>
              <circle
                cx={x}
                cy={y}
                r={6.5 + m.supportsConclusion * 4}
                fill={isEvt ? "#4c1d9522" : on ? "#f59e0b22" : "#27272a"}
                stroke={isEvt ? "#a78bfa" : on ? "#fbbf24" : "#52525b"}
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                style={{
                  fontSize: "8px",
                  fill: isEvt ? "#ddd6fe" : on ? "#fde68a" : "#a1a1aa",
                  fontFamily: "monospace",
                }}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Core — readiness % */}
        <circle
          cx={cx}
          cy={cy}
          r={38 * pulse}
          fill="#18181b"
          stroke={coreColor}
          strokeWidth="2.2"
        />
        <circle
          cx={cx}
          cy={cy}
          r={30}
          fill="#0a0a0a"
          stroke={blockDetected ? "#34d399" : "#57534e"}
          strokeWidth="1"
          opacity="0.95"
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          style={{
            fontSize: "19px",
            fontWeight: 700,
            fill: blockDetected ? "#6ee7b7" : "#fafafa",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {blockDetected ? "100" : readiness.toFixed(0)}%
        </text>
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          style={{
            fontSize: "7px",
            fill: blockDetected ? "#34d399" : "#a1a1aa",
            fontFamily: "system-ui",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {blockDetected ? "BLOCK" : "READY"}
        </text>
      </svg>

      {/* v2.5 metric chips */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-[300px] -mt-0.5">
        <div className="text-center rounded-lg border border-violet-500/30 bg-violet-500/10 py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-violet-400 uppercase">EVT 24h</div>
          <div className="text-[10px] font-mono font-bold text-violet-300 tabular-nums break-all leading-tight">
            {evt24 > 0 ? evt24.toExponential(2) : "—"}
          </div>
        </div>
        <div className="text-center rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-amber-500 uppercase">trend</div>
          <div className="text-[10px] font-mono font-bold text-amber-400 tabular-nums">
            {(trend * 100).toFixed(0)}%
          </div>
        </div>
        <div className="text-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-emerald-500 uppercase">accel</div>
          <div className="text-[10px] font-mono font-bold text-emerald-400 tabular-nums">
            {(accel * 100).toFixed(0)}%
          </div>
        </div>
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-[var(--muted)] uppercase">slot</div>
          <div className="text-[10px] font-mono font-bold text-amber-500">
            {(Math.min(1, slot) * 100).toFixed(0)}%
          </div>
          <div className="text-[7px] font-mono text-[var(--muted)]">
            {secSinceBlock}s
          </div>
        </div>
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-[var(--muted)] uppercase">ΔD</div>
          <div className="text-[10px] font-mono font-bold text-orange-400 tabular-nums">
            {retargetPct >= 0 ? "+" : ""}
            {retargetPct.toFixed(1)}%
          </div>
        </div>
        <div className="text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5 px-1 min-w-0">
          <div className="text-[8px] text-[var(--muted)] uppercase">eff HR</div>
          <div className="text-[10px] font-mono font-bold text-[var(--fg)] tabular-nums break-all leading-tight">
            {enh && enh.effective.hashrateHs > 0
              ? formatHashrateGhs(enh.effective.hashrateHs, 1)
              : formatHashrateGhs(synth.hashrateHs, 1)}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[9px] text-center text-[var(--muted)] max-w-xs leading-relaxed">
        {locale === "ko"
          ? "중심=Block Readiness · 보라 링=EVT · 녹 링=합의 · ⑦번=EVT 메소드. 100%=best≥D."
          : "Center=Readiness · violet=EVT · green=consensus · node ⑦=EVT. 100%=best≥D."}
      </p>
    </div>
  );
}
