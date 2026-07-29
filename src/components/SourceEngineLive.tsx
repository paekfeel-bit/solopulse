"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { formatHashrateGhs } from "@/lib/mining";
import type { EnhancedBundle } from "@/lib/mechanismEnhanced";

type Props = {
  hashrateHs: number;
  networkDiff: number;
  bestShare: number;
  live: boolean;
  pDay: number;
  confidence: number;
  agentStatus: string;
  /** v2.5 enhanced metrics (optional) */
  enhanced?: EnhancedBundle | null;
};

/**
 * Source Engine top panel — v2.5 readiness-aware core.
 */
export function SourceEngineLive({
  hashrateHs,
  networkDiff,
  bestShare,
  live,
  pDay,
  confidence,
  agentStatus,
  enhanced,
}: Props) {
  const { locale } = useI18n();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setT((x) => x + 1), 50);
    return () => clearInterval(id);
  }, [live]);

  const netHs = useMemo(() => {
    if (!networkDiff) return 0;
    return (networkDiff * Math.pow(2, 32)) / 600;
  }, [networkDiff]);

  const share = netHs > 0 ? hashrateHs / netHs : 0;
  const readiness = enhanced?.blockDetected
    ? 100
    : enhanced?.blockReadiness ?? confidence * 100;
  const spinSec = live
    ? Math.max(
        2.2,
        Math.min(16, 5 / Math.max(share * 1e8, 0.05) / (0.7 + readiness / 200))
      )
    : 40;
  const pulse = live ? 0.55 + 0.45 * Math.sin(t / 8) : 0.25;
  const ladder =
    networkDiff > 0 && bestShare > 0
      ? Math.min(1, Math.log10(bestShare + 1) / Math.log10(networkDiff + 1))
      : 0;

  const lambdaDay =
    hashrateHs > 0 && networkDiff > 0
      ? (hashrateHs * 86400) / (networkDiff * Math.pow(2, 32))
      : 0;

  const evt24 = enhanced?.gumbel.pBlock24h ?? 0;
  const readyFrac = Math.max(0, Math.min(1, readiness / 100));
  const ringDeg = readyFrac * 360;
  const coreBorder = enhanced?.blockDetected
    ? "border-emerald-500"
    : readiness >= 55
      ? "border-amber-500"
      : "border-[var(--border)]";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--card)] via-[var(--bg)] to-[var(--bg)] p-4 sm:p-5 shadow-inner shadow-amber-900/10 overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 4px)",
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/90 font-semibold">
            Source Engine · v2.5
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
            {locale === "ko" ? "코어 마이닝 인텔리전스" : "Core Mining Intelligence"}
          </h2>
        </div>
        <div
          className={`text-[10px] font-mono px-2 py-1 rounded border ${
            live
              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
              : "border-[var(--border)] text-[var(--muted)] bg-[var(--border)]/50"
          }`}
        >
          {live ? "● STREAMING" : `○ ${agentStatus}`}
        </div>
      </div>

      <div className="relative grid sm:grid-cols-[1fr_1.1fr] gap-4 items-center">
        {/* rotating core with readiness ring */}
        <div className="flex justify-center py-2">
          <div className="relative w-44 h-44 sm:w-52 sm:h-52">
            {/* Readiness conic ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from -90deg, ${
                  enhanced?.blockDetected ? "#10b981" : "#f59e0b"
                } ${ringDeg}deg, rgba(120,113,108,0.25) ${ringDeg}deg 360deg)`,
                opacity: live ? 0.95 : 0.4,
                boxShadow: live
                  ? `0 0 ${16 + pulse * 24}px rgba(245,158,11,${0.12 + pulse * 0.18})`
                  : undefined,
              }}
            />
            <div className="absolute inset-[5px] rounded-full bg-[var(--bg)]" />
            <div
              className={`absolute inset-3 rounded-full border-2 ${coreBorder}`}
              style={{
                animation: live
                  ? `sp-spin ${spinSec}s linear infinite`
                  : undefined,
                background:
                  "conic-gradient(from 0deg, #292524, #78350f, #f59e0b, #292524, #44403c, #fbbf24, #292524)",
                opacity: live ? 0.88 : 0.35,
              }}
            />
            <div className="absolute inset-9 rounded-full bg-[var(--card)] border border-[var(--border)] flex flex-col items-center justify-center px-1">
              <div className="text-[8px] text-[var(--muted)] uppercase tracking-wider">
                Ready
              </div>
              <div
                className={`text-lg sm:text-xl font-mono font-black tabular-nums ${
                  enhanced?.blockDetected
                    ? "text-emerald-400"
                    : "text-amber-500"
                }`}
              >
                {enhanced?.blockDetected
                  ? "100"
                  : readiness.toFixed(0)}
                %
              </div>
              <div className="text-[8px] text-[var(--muted)] mt-0.5">EVT 24h</div>
              <div className="text-[10px] font-mono text-violet-400 tabular-nums">
                {evt24 > 0 ? evt24.toExponential(2) : pDay > 0 ? pDay.toExponential(2) : "—"}
              </div>
            </div>
            {live &&
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-amber-400"
                  style={{
                    animation: `sp-orbit ${spinSec * (0.7 + i * 0.2)}s linear infinite`,
                    animationDelay: `${-i * 0.4}s`,
                    opacity: 0.9,
                  }}
                />
              ))}
          </div>
        </div>

        <div className="space-y-2.5 font-mono text-xs">
          <Row
            k={locale === "ko" ? "네트워크 점유" : "Network share"}
            v={share > 0 ? share.toExponential(3) : "—"}
          />
          <Row
            k={locale === "ko" ? "Block Readiness" : "Block Readiness"}
            v={`${readiness.toFixed(1)}%`}
            accent
          />
          <Row
            k={locale === "ko" ? "EVT 추이" : "EVT trend"}
            v={
              enhanced
                ? `${(enhanced.gumbel.trendScore * 100).toFixed(0)}%`
                : "—"
            }
          />
          <Row
            k={locale === "ko" ? "리타겟 ΔD" : "Retarget ΔD"}
            v={
              enhanced
                ? `${enhanced.retarget.changePct >= 0 ? "+" : ""}${enhanced.retarget.changePct.toFixed(1)}%`
                : "—"
            }
          />
          <Row
            k={locale === "ko" ? "가속도" : "Acceleration"}
            v={
              enhanced
                ? `${(enhanced.acceleration.score * 100).toFixed(0)}%`
                : "—"
            }
          />
          <Row
            k={locale === "ko" ? "실효 해시" : "Effective HR"}
            v={
              enhanced && enhanced.effective.hashrateHs > 0
                ? formatHashrateGhs(enhanced.effective.hashrateHs, 1)
                : hashrateHs > 0
                  ? formatHashrateGhs(hashrateHs, 1)
                  : "—"
            }
          />
          <div>
            <div className="flex justify-between text-[var(--muted)] mb-1">
              <span>{locale === "ko" ? "베스트셰어 사다리" : "Best-share ladder"}</span>
              <span className="text-amber-500/90">{(ladder * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden border border-[var(--border)]">
              <div
                className="h-full bg-gradient-to-r from-amber-700 via-amber-400 to-yellow-200 transition-all duration-500"
                style={{ width: `${ladder * 100}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-[var(--muted)] leading-relaxed border-t border-[var(--border)] pt-2">
            {locale === "ko"
              ? `λ·day ${lambdaDay > 0 ? lambdaDay.toExponential(2) : "—"} · 중심 링=Readiness · 회전∝해시. 100%=best≥D (BTC 확정 아님 표시 경로).`
              : `λ·day ${lambdaDay > 0 ? lambdaDay.toExponential(2) : "—"} · ring=Readiness · spin∝hash. 100%=best≥D (not a payout promise).`}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--border)]/80 pb-1">
      <span className="text-[var(--muted)]">{k}</span>
      <span
        className={`tabular-nums ${
          accent ? "text-amber-500 font-bold" : "text-[var(--fg)]"
        }`}
      >
        {v}
      </span>
    </div>
  );
}
