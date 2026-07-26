"use client";

import type { NetworkStats } from "@/lib/types";
import { formatDifficulty, formatHashrate } from "@/lib/mining";
import { useI18n } from "@/lib/i18n";
import { LivePrice } from "./LivePrice";

interface Props {
  network: NetworkStats;
}

export function NetworkBar({ network }: Props) {
  const { t } = useI18n();
  const rewardUsd = network.blockReward * network.priceUsd;
  const diffSign = network.difficultyChange >= 0 ? "+" : "";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
      <LivePrice seed={network.priceUsd} />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 sm:px-3 py-2.5 min-w-0 overflow-hidden">
        <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--muted)] truncate">
          {t("difficulty")}
        </div>
        <div className="text-sm sm:text-lg font-semibold font-mono text-amber-500 tabular-nums break-all leading-tight mt-0.5">
          {formatDifficulty(network.difficulty)}
        </div>
        <div className="text-[9px] sm:text-[10px] text-[var(--muted)] font-mono truncate leading-snug">
          {diffSign}
          {network.difficultyChange.toFixed(2)}% · {network.remainingBlocks} blk
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 sm:px-3 py-2.5 min-w-0 overflow-hidden">
        <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--muted)] truncate">
          {t("blockReward")}
        </div>
        <div className="text-sm sm:text-lg font-semibold font-mono text-emerald-500 tabular-nums break-all leading-tight mt-0.5">
          {network.blockReward} BTC
        </div>
        <div className="text-[9px] sm:text-[10px] text-[var(--muted)] font-mono truncate leading-snug">
          ≈ ${rewardUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 sm:px-3 py-2.5 min-w-0 overflow-hidden">
        <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--muted)] truncate">
          {t("network")}
        </div>
        <div className="text-sm sm:text-lg font-semibold font-mono text-[var(--fg)] tabular-nums break-all leading-tight mt-0.5">
          {formatHashrate(network.hashrate, 1)}
        </div>
        <div className="text-[9px] sm:text-[10px] text-[var(--muted)] font-mono truncate leading-snug">
          #{network.blockHeight.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
