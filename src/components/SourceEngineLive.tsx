"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = {
  /** hashrate in H/s */
  hashrateHs: number;
  networkDiff: number;
  bestShare: number;
  live: boolean;
  pDay: number;
  confidence: number;
  agentStatus: string;
};

/**
 * Source Engine visualization driven by real math + live telemetry.
 * Visual speed ∝ share of network hashrate / pulse ∝ poll vitality.
 */
export function SourceEngineLive({
  hashrateHs,
  networkDiff,
  bestShare,
  live,
  pDay,
  confidence,
  agentStatus,
}: Props) {
  const { locale } = useI18n();
  const [t, setT] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 50);
    return () => clearInterval(id);
  }, []);

  const netHs = useMemo(() => {
    // rough network HS from difficulty (diff * 2^32 / 600)
    if (!networkDiff) return 0;
    return (networkDiff * Math.pow(2, 32)) / 600;
  }, [networkDiff]);

  const share = netHs > 0 ? hashrateHs / netHs : 0;
  // animation rpm: more hashrate → faster spin (clamped)
  const spinSec = live
    ? Math.max(2.5, Math.min(18, 4 / Math.max(share * 1e8, 0.05)))
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

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--card)] via-[var(--bg)] to-[var(--bg)] p-4 sm:p-5 shadow-inner shadow-amber-900/10 overflow-hidden relative">
      {/* retro speaker grille */}
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
            Source Engine · LIVE
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
        {/* rotating core */}
        <div className="flex justify-center py-2">
          <div className="relative w-40 h-40 sm:w-48 sm:h-48">
            <div
              className="absolute inset-0 rounded-full border-2 border-amber-700/40"
              style={{
                boxShadow: `0 0 ${20 + pulse * 30}px rgba(245,158,11,${0.15 + pulse * 0.2})`,
              }}
            />
            <div
              className="absolute inset-3 rounded-full border border-[var(--border)]"
              style={{
                animation: `sp-spin ${spinSec}s linear infinite`,
                background:
                  "conic-gradient(from 0deg, #292524, #78350f, #f59e0b, #292524, #44403c, #fbbf24, #292524)",
                opacity: 0.85,
              }}
            />
            <div className="absolute inset-8 rounded-full bg-[var(--card)] border border-[var(--border)] flex flex-col items-center justify-center">
              <div className="text-[9px] text-[var(--muted)] uppercase tracking-widest">λ·day</div>
              <div className="text-sm font-mono text-amber-400 tabular-nums">
                {lambdaDay > 0 ? lambdaDay.toExponential(2) : "—"}
              </div>
              <div className="text-[9px] text-[var(--muted)] mt-1">P(24h)</div>
              <div className="text-xs font-mono text-[var(--fg)]">
                {pDay > 0
                  ? pDay >= 1e-6
                    ? `${(pDay * 100).toFixed(6)}%`
                    : pDay.toExponential(2)
                  : "—"}
              </div>
            </div>
            {/* orbit dots */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-amber-400"
                style={{
                  animation: `sp-orbit ${spinSec * (0.7 + i * 0.2)}s linear infinite`,
                  animationDelay: `${-i * 0.4}s`,
                  opacity: live ? 0.9 : 0.3,
                }}
              />
            ))}
          </div>
        </div>

        {/* readouts */}
        <div className="space-y-3 font-mono text-xs">
          <Row
            k={locale === "ko" ? "네트워크 점유" : "Network share"}
            v={share > 0 ? share.toExponential(3) : "—"}
          />
          <Row
            k={locale === "ko" ? "엔진 신뢰도" : "Engine confidence"}
            v={`${Math.round(confidence * 100)}%`}
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
              ? "회전 속도 ∝ 실시간 해시 / 네트워크. 코어 수치는 Poisson λ·P(day) 실계산. 예측·당첨 보장이 아닙니다."
              : "Spin ∝ live hashrate share. Core numbers are real Poisson λ / P(day). Not a prediction of winning."}
          </div>
        </div>
      </div>

    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--border)]/80 pb-1">
      <span className="text-[var(--muted)]">{k}</span>
      <span className="text-[var(--fg)] tabular-nums">{v}</span>
    </div>
  );
}
