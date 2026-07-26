"use client";

import type { BlockOdds } from "@/lib/types";
import { formatDuration, formatOddsPercent, formatOneIn } from "@/lib/mining";

interface Props {
  odds: BlockOdds;
  hashrateLabel: string;
}

const PERIODS: { key: keyof Pick<BlockOdds, "day" | "week" | "month" | "year">; label: string }[] = [
  { key: "day", label: "1 Day" },
  { key: "week", label: "1 Week" },
  { key: "month", label: "1 Month" },
  { key: "year", label: "1 Year" },
];

export function OddsPanel({ odds, hashrateLabel }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Odds of Finding a Block</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Poisson · λ = h / (D · 2³²) · using {hashrateLabel}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Expected time</div>
          <div className="text-sm font-mono text-amber-400 font-semibold">
            {formatDuration(odds.expectedSeconds)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PERIODS.map(({ key, label }) => {
          const p = odds[key];
          return (
            <div
              key={key}
              className="rounded-xl bg-zinc-950/80 border border-zinc-800 p-3.5 text-center"
            >
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{label}</div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {formatOddsPercent(p)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 font-mono">{formatOneIn(p)}</div>
              <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-orange-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0.5, p * 100 * 20))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
