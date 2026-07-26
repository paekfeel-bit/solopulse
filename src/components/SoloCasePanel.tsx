"use client";

import type { LiveTickState } from "@/lib/liveEngine";
import {
  BLOCK_FIND_PIPELINE,
  FLEET_EMPIRICS,
  formatCaseHashrate,
  SOLO_WIN_CASES,
} from "@/lib/soloCases";
import { formatDifficulty, formatHashrate } from "@/lib/mining";

interface Props {
  tick: LiveTickState | null;
  hashrateBase: number;
  bestShare: number;
  networkDiff: number;
}

export function SoloCasePanel({ tick, hashrateBase, bestShare, networkDiff }: Props) {
  const match = tick?.caseMatch;
  const prox = tick?.proximity;
  const luck = tick?.luck ?? 1;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden min-w-0">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--fg)] leading-snug">
          Success Mechanism Source
        </h2>
        <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
          Bitaxe / NerdQAxe / open-source wins
        </p>
      </div>

      {/* Your match to historical winners */}
      {match && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:p-4 space-y-3 min-w-0">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-1.5">
            <div className="text-xs font-medium text-[var(--fg)] leading-snug">
              Your device vs winner class
            </div>
            <span
              className={`self-start text-[10px] px-2 py-0.5 rounded-full border font-mono shrink-0 ${
                match.sameClass
                  ? "border-emerald-700/60 text-emerald-400 bg-emerald-950/40"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {match.sameClass ? "SAME CLASS" : "OUTSIDE BAND"}
            </span>
          </div>
          <p className="text-xs text-amber-400/90 font-medium leading-relaxed break-words">
            {match.bandLabel}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-center min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] text-[var(--muted)] uppercase">Your HR</div>
              <div className="text-sm font-mono text-[var(--fg)] break-all">
                {formatHashrate(hashrateBase)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-[var(--muted)] uppercase">vs median</div>
              <div className="text-sm font-mono text-amber-400 break-all">
                {match.vsMedianWinner >= 1
                  ? `${match.vsMedianWinner.toFixed(2)}×`
                  : `${(match.vsMedianWinner * 100).toFixed(1)}%`}
              </div>
            </div>
            <div className="min-w-0 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-[var(--muted)] uppercase">Tickets / block</div>
              <div className="text-sm font-mono text-[var(--fg)] break-all">
                {prox
                  ? prox.ticketsPerBlock > 0
                    ? prox.ticketsPerBlock.toExponential(2)
                    : "—"
                  : "—"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed break-words">
            {match.fleetInsight}
          </p>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed border-t border-[var(--border)] pt-2 break-words">
            {match.empiricalRuntimeHint}
          </p>
        </div>
      )}

      {/* Mechanism proximity */}
      {prox && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:p-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 mb-2">
            <div className="text-xs text-[var(--muted)]">Share ladder (winner path)</div>
            <div className="text-[11px] font-mono text-amber-400 break-all">{prox.label}</div>
          </div>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-orange-800 via-amber-500 to-yellow-300 transition-all duration-500"
              style={{ width: `${Math.max(2, prox.logProgress * 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-1.5 text-[11px] font-mono text-[var(--muted)]">
            <div className="min-w-0 break-all">
              Best share{" "}
              <span className="text-[var(--fg)]">{formatDifficulty(bestShare)}</span>
            </div>
            <div className="min-[380px]:text-right min-w-0 break-all">
              Need{" "}
              <span className="text-orange-400">{formatDifficulty(networkDiff)}</span>
            </div>
            <div className="min-w-0">
              Session luck{" "}
              <span className={luck >= 1 ? "text-emerald-400" : "text-[var(--muted)]"}>
                {luck.toFixed(2)}×
              </span>
            </div>
            <div className="min-[380px]:text-right min-w-0 break-all">
              Exp. best{" "}
              <span className="text-[var(--muted)]">
                {tick ? formatDifficulty(tick.expectedBest) : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--fg)] mb-2 leading-snug">
          How every documented win left the mempool
        </div>
        <ol className="space-y-2">
          {BLOCK_FIND_PIPELINE.map((s) => (
            <li
              key={s.step}
              className="flex gap-2.5 sm:gap-3 text-[11px] leading-relaxed min-w-0"
            >
              <span className="shrink-0 w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 font-mono text-[10px] flex items-center justify-center border border-amber-800/40">
                {s.step}
              </span>
              <div className="min-w-0">
                <div className="text-[var(--fg)] font-medium">{s.name}</div>
                <div className="text-[var(--muted)] break-words">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[10px] text-[var(--muted)] font-mono leading-relaxed break-words">
          Coinbase maturity: {FLEET_EMPIRICS.coinbaseMaturityBlocks} blocks (~
          {FLEET_EMPIRICS.coinbaseMaturityHours.toFixed(1)}h) before spendable
        </p>
      </div>

      {/* Case table */}
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--fg)] mb-2 leading-snug">
          Training set — real small-miner wins
        </div>
        <div className="overflow-x-auto -mx-1 px-1 overscroll-x-contain">
          <table className="w-full text-[10px] sm:text-[11px] text-left min-w-[440px]">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-1.5 pr-2 font-medium">Date</th>
                <th className="py-1.5 pr-2 font-medium">Device</th>
                <th className="py-1.5 pr-2 font-medium">HR</th>
                <th className="py-1.5 pr-2 font-medium">Pool</th>
                <th className="py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {SOLO_WIN_CASES.map((c) => {
                const close =
                  match?.nearestCases.some((n) => n.id === c.id) ?? false;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-[var(--border)] ${
                      close
                        ? "bg-amber-500/10 text-[var(--fg)]"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{c.date}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{c.device}</td>
                    <td className="py-1.5 pr-2 font-mono whitespace-nowrap">
                      {formatCaseHashrate(c.hashrateHs)}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{c.pool}</td>
                    <td
                      className="py-1.5 text-[var(--muted)] max-w-[140px] sm:max-w-[180px] truncate"
                      title={c.notes}
                    >
                      {c.notes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[var(--muted)] leading-relaxed break-words">
          Fleet: ~{FLEET_EMPIRICS.verifiedSoloBlocks12m} verified solo blocks / 12m · avg
          interval {FLEET_EMPIRICS.avgDaysBetweenSoloWins}d · winner band{" "}
          {formatCaseHashrate(FLEET_EMPIRICS.winnerHashrateP25)}–
          {formatCaseHashrate(FLEET_EMPIRICS.winnerHashrateP90)} (p25–p90).
        </p>
      </div>
    </section>
  );
}
