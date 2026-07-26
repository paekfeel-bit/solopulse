"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { formatTimeAgo } from "@/lib/mining";

type BlockRow = {
  height: number;
  id: string;
  timestamp: number;
  txCount: number;
  poolName: string;
  poolSlug: string;
  rewardSats: number;
  totalFees: number;
  medianFee: number;
  coinbaseAddress: string | null;
};

type BlocksPayload = {
  tipHeight: number;
  miningHeight: number;
  lastBlock: BlockRow | null;
  lastIntervalSec: number | null;
  blocks: BlockRow[];
  fetchedAt: number;
};

/** Wide, short mempool strip (horizontal layout) */
export function MempoolBlocks({ onNewTip }: { onNewTip?: (h: number) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<BlocksPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/blocks?_=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as BlocksPayload;
        if (cancelled) return;
        setData(j);
        setErr(null);
        if (j.tipHeight) onNewTip?.(j.tipHeight);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "fail");
      }
    };
    load();
    // Tip height changes ~10m but fees/pools update; poll often enough for live feel
    const id = setInterval(load, 5_000);
    const tmr = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(tmr);
    };
  }, [onNewTip]);

  const miningSince = data?.lastBlock
    ? Math.max(0, Math.floor(Date.now() / 1000 - data.lastBlock.timestamp))
    : 0;
  void tick;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 overflow-hidden">
      {/* Title row — compact */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-semibold text-[var(--fg)] whitespace-nowrap">
            {t("mempoolBlocks")}
          </h2>
          <span className="text-[10px] text-[var(--muted)] truncate hidden sm:inline">
            {t("mempoolBlocksHint")}
          </span>
        </div>
        <a
          href="https://mempool.space/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-amber-500 shrink-0"
        >
          mempool ↗
        </a>
      </div>

      {err && !data && <p className="text-[11px] text-red-400">{err}</p>}

      {data && (
        <>
          {/* Horizontal metrics strip */}
          <div className="flex flex-row flex-nowrap gap-2 overflow-x-auto pb-0.5">
            <div className="flex-1 min-w-[5.5rem] rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1.5">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-none">
                {t("miningNow")}
              </div>
              <div className="text-base font-mono font-bold text-amber-500 tabular-nums leading-tight mt-0.5">
                #{data.miningHeight.toLocaleString()}
              </div>
              <div className="text-[9px] text-[var(--muted)] font-mono">{miningSince}s</div>
            </div>
            <div className="flex-1 min-w-[5.5rem] rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1.5">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-none">
                {t("latestBlock")}
              </div>
              <div className="text-base font-mono font-bold text-[var(--fg)] tabular-nums leading-tight mt-0.5">
                #{data.tipHeight.toLocaleString()}
              </div>
              <div className="text-[9px] text-[var(--muted)] font-mono truncate">
                {data.lastBlock ? formatTimeAgo(data.lastBlock.timestamp) : "—"}
              </div>
            </div>
            <div className="flex-1 min-w-[5.5rem] rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1.5">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-none">
                {t("minedBy")}
              </div>
              <div className="text-sm font-semibold text-orange-400 truncate leading-tight mt-0.5">
                {data.lastBlock?.poolName || "—"}
              </div>
              <div className="text-[9px] text-[var(--muted)] font-mono">
                {data.lastBlock
                  ? `${(data.lastBlock.rewardSats / 1e8).toFixed(4)} BTC`
                  : "—"}
              </div>
            </div>
            <div className="flex-1 min-w-[5rem] rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1.5">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-none">
                {t("blockInterval")}
              </div>
              <div className="text-sm font-mono font-bold text-[var(--fg)] tabular-nums leading-tight mt-0.5">
                {data.lastIntervalSec != null
                  ? `${Math.floor(data.lastIntervalSec / 60)}m${data.lastIntervalSec % 60}s`
                  : "—"}
              </div>
              <div className="text-[9px] text-[var(--muted)]">
                {data.lastBlock?.txCount.toLocaleString()} txs
              </div>
            </div>
          </div>

          {/* Thin progress */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-600 to-amber-400 transition-all duration-1000"
                style={{ width: `${Math.min(100, (miningSince / 600) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-[var(--muted)] shrink-0">
              {miningSince}s/600s
            </span>
          </div>

          {/* Horizontal recent blocks scroller */}
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {data.blocks.slice(0, 6).map((b) => (
              <a
                key={b.id}
                href={`https://mempool.space/block/${b.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 min-w-[4.8rem] hover:border-amber-500/40 transition"
              >
                <div className="text-[10px] font-mono font-semibold text-amber-500">
                  #{b.height.toLocaleString()}
                </div>
                <div className="text-[9px] text-[var(--fg)] truncate max-w-[5.5rem]">
                  {b.poolName}
                </div>
                <div className="text-[9px] font-mono text-[var(--muted)]">
                  {(b.rewardSats / 1e8).toFixed(3)}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
