"use client";

import type { LiveTickState } from "@/lib/liveEngine";
import {
  formatDuration,
  formatHashrate,
  formatOddsPercent,
  formatOneIn,
} from "@/lib/mining";
import { useI18n } from "@/lib/i18n";

interface Props {
  tick: LiveTickState | null;
}

function sciDigits(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0.000000000e+0";
  return p.toExponential(9);
}

export function LiveOddsPanel({ tick }: Props) {
  const { t } = useI18n();

  if (!tick) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-sm text-[var(--muted)]">{t("scanning")}</div>
      </section>
    );
  }

  const { display, odds, hashrateEff, pTick, hashesSession, hashesThisTick } = tick;

  const periods: { key: "pDay" | "pWeek" | "pMonth" | "pYear"; label: string }[] = [
    { key: "pDay", label: t("oneDay") },
    { key: "pWeek", label: t("oneWeek") },
    { key: "pMonth", label: t("oneMonth") },
    { key: "pYear", label: t("oneYear") },
  ];

  return (
    <section className="rounded-2xl border border-amber-700/30 bg-[var(--card)] p-3 sm:p-4 shadow-lg min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--fg)] leading-snug">{t("yourChance")}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              0.5s
            </span>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{t("oddsHint")}</p>
        </div>
        <div className="sm:text-right shrink-0 flex sm:block items-baseline justify-between gap-2 rounded-lg sm:rounded-none border border-[var(--border)] sm:border-0 bg-[var(--bg)] sm:bg-transparent px-2.5 py-1.5 sm:p-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {t("expectedTime")}
          </div>
          <div className="text-sm font-mono text-amber-500 font-semibold break-all">
            {formatDuration(odds.expectedSeconds)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-2.5 min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
            P(0.5s)
          </div>
          <div className="mt-0.5 text-xs sm:text-sm font-mono font-bold text-orange-400 tabular-nums break-all leading-snug">
            {sciDigits(pTick)}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-2.5 min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
            tick H
          </div>
          <div className="mt-0.5 text-sm font-mono font-bold text-[var(--fg)] tabular-nums break-all">
            {formatHashrate(hashesThisTick / 0.5, 2)}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-2.5 min-w-0 overflow-hidden col-span-2 sm:col-span-1">
          <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
            session Σ
          </div>
          <div className="mt-0.5 text-sm font-mono font-bold text-emerald-500 tabular-nums break-all">
            {hashesSession >= 1e15
              ? `${(hashesSession / 1e15).toFixed(3)}P`
              : hashesSession >= 1e12
                ? `${(hashesSession / 1e12).toFixed(3)}T`
                : `${(hashesSession / 1e9).toFixed(2)}G`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {periods.map(({ key, label }) => {
          const p = display[key];
          return (
            <div
              key={key}
              className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-2.5 text-center min-w-0 overflow-hidden"
            >
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                {label}
              </div>
              <div className="text-base sm:text-lg font-bold font-mono text-[var(--fg)] tabular-nums break-all leading-tight">
                {formatOddsPercent(p)}
              </div>
              <div className="text-[9px] text-amber-500/90 mt-0.5 font-mono tabular-nums break-all leading-tight">
                {sciDigits(p)}
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono break-all">
                {formatOneIn(p)}
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-orange-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(1, Math.log10(1 + p * 1e12) * 8))}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-[var(--muted)] leading-relaxed">
        {t("chanceExplain")} · h={formatHashrate(hashrateEff)} · tick #
        {display.tickIndex.toLocaleString()}
      </p>
    </section>
  );
}
