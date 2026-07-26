"use client";

import { formatDifficulty, bestShareProgress } from "@/lib/mining";
import { useI18n } from "@/lib/i18n";

interface Props {
  bestShare: number;
  bestEver: number;
  networkDifficulty: number;
}

export function BestShareBar({ bestShare, bestEver, networkDifficulty }: Props) {
  const { t } = useI18n();
  const best = Math.max(bestShare, bestEver);
  const progress = bestShareProgress(best, networkDifficulty);
  const visual = Math.min(1, Math.log10(1 + progress * 1e6) / 6);
  const pctOfNet = progress * 100;
  const hot = progress >= 0.01;
  const found = progress >= 1;

  return (
    <section
      className={`rounded-2xl border p-3 sm:p-4 transition-colors overflow-hidden min-w-0 ${
        found
          ? "border-emerald-500/60 bg-emerald-500/10"
          : hot
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-[var(--border)] bg-[var(--card)]"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--fg)] leading-snug">
            {t("shareVsTarget")}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
            share ≥ network difficulty ⇒ block
          </p>
        </div>
        {found && (
          <span className="text-xs font-semibold text-emerald-500 border border-emerald-500/40 px-2 py-0.5 rounded-full shrink-0">
            BLOCK
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="min-w-0 overflow-hidden">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {t("bestShare")}
          </div>
          <div className="text-sm sm:text-base font-mono font-semibold text-amber-500 break-all">
            {formatDifficulty(bestShare)}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {t("bestEver")}
          </div>
          <div className="text-sm sm:text-base font-mono font-semibold text-[var(--fg)] break-all">
            {formatDifficulty(bestEver)}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {t("difficulty")}
          </div>
          <div className="text-sm sm:text-base font-mono font-semibold text-orange-400 break-all">
            {formatDifficulty(networkDifficulty)}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-[11px] text-[var(--muted)]">
          <span className="truncate">proximity</span>
          <span className="font-mono shrink-0">
            {pctOfNet >= 0.0001 ? `${pctOfNet.toFixed(6)}%` : `${pctOfNet.toExponential(2)}%`}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              found
                ? "bg-gradient-to-r from-emerald-500 to-green-300"
                : "bg-gradient-to-r from-orange-700 via-amber-500 to-yellow-300"
            }`}
            style={{ width: `${Math.max(1.5, visual * 100)}%` }}
          />
        </div>
      </div>
    </section>
  );
}
