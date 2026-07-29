"use client";

import { useMemo } from "react";
import type { LiveTickState } from "@/lib/liveEngine";
import { computeSourceContact } from "@/lib/sourceContact";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatCaseHashrate, SOLO_WIN_CASES } from "@/lib/soloCases";
import { formatDifficulty } from "@/lib/mining";
import { SourceRadar } from "./SourceRadar";
import { BtcDisclaimer } from "./BtcDisclaimer";

interface Props {
  tick: LiveTickState | null;
  hashrateBase: number;
  bestShare: number;
  networkDiff: number;
  lastShare: number;
  authorised: number;
  shares: number;
  workers: number;
  pool: string;
  foundBlocks?: number;
  deviceOnline?: boolean;
}

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

export function SourceContactPanel({
  tick,
  hashrateBase,
  bestShare,
  networkDiff,
  lastShare,
  authorised,
  shares,
  workers,
  pool,
  foundBlocks = 0,
  deviceOnline,
}: Props) {
  const { t, locale } = useI18n();

  const contact = useMemo(
    () =>
      computeSourceContact({
        hashrateHs: hashrateBase,
        bestShare,
        networkDiff,
        lastShareUnix: lastShare,
        authorisedUnix: authorised,
        shares,
        workers,
        pool,
        nearestCases: tick?.caseMatch?.nearestCases,
        foundBlocks,
        deviceOnline,
      }),
    [
      hashrateBase,
      bestShare,
      networkDiff,
      lastShare,
      authorised,
      shares,
      workers,
      pool,
      tick?.caseMatch?.nearestCases,
      foundBlocks,
      deviceOnline,
    ]
  );

  return (
    <section className="rounded-2xl border border-amber-700/30 bg-[var(--card)] p-4 space-y-3 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--fg)]">{t("sourceContact")}</h2>
            <BtcDisclaimer />
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{t("sourceContactHint")}</p>
        </div>
        <div
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
            contact.overall >= 90
              ? "border-emerald-400 text-emerald-400 bg-emerald-500/20 animate-pulse"
              : contact.touching
                ? "border-emerald-500/50 text-emerald-500 bg-emerald-500/10"
                : "border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          {contact.touching ? t("sourceTouching") : t("sourceNotTouching")} ·{" "}
          {contact.overall.toFixed(0)}%
        </div>
      </div>

      {/* Dynamic real-data radar */}
      <SourceRadar
        contact={contact}
        hashrateHs={hashrateBase}
        lastShareUnix={lastShare}
        live={!!deviceOnline && hashrateBase > 0}
      />

      {/* Truth banner — 100% ≠ BTC */}
      <div
        className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
          contact.blockFound
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
            : "border-amber-600/40 bg-amber-500/10 text-amber-200/90"
        }`}
      >
        <div className="font-semibold mb-0.5">
          {contact.blockFound
            ? locale === "ko"
              ? "블록 조건 충족"
              : locale === "ja"
                ? "ブロック条件達成"
                : "Block condition met"
            : locale === "ko"
              ? "중요: 접촉 100% ≠ 비트코인 보상"
              : locale === "ja"
                ? "重要: 接触100% ≠ BTC報酬"
                : "Important: 100% contact ≠ BTC reward"}
        </div>
        {pick(locale, contact.truth)}
      </div>

      <p className="text-xs text-amber-500 font-medium leading-snug text-center">
        {pick(locale, contact.label)}
      </p>

      {/* Detailed steps list */}
      <ol className="space-y-1.5">
        {contact.steps.map((s) => {
          const color =
            s.status === "on"
              ? "border-emerald-500/50 bg-emerald-500/10"
              : s.status === "partial"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-[var(--border)] bg-[var(--bg)]";
          const dot =
            s.status === "on"
              ? "bg-emerald-500"
              : s.status === "partial"
                ? "bg-amber-400"
                : "bg-zinc-500";
          return (
            <li key={s.id} className={`rounded-xl border p-2.5 flex gap-2.5 min-w-0 ${color}`}>
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${dot} ${
                    s.status === "on" ? "animate-pulse" : ""
                  }`}
                />
                <span className="text-[10px] font-mono text-[var(--muted)]">{s.step}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="text-xs font-semibold text-[var(--fg)]">
                    {pick(locale, s.title)}
                  </div>
                  {s.liveValue && (
                    <div className="text-[10px] font-mono text-amber-500 break-all">
                      {s.liveValue}
                    </div>
                  )}
                </div>
                {/* real score bar */}
                <div className="mt-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-600 to-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.max(2, s.score * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {contact.nearestCase && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
            {t("nearestWinCase")}
          </div>
          <div className="text-sm font-semibold text-[var(--fg)]">
            {contact.nearestCase.device}
          </div>
          <div className="text-[11px] font-mono text-[var(--muted)] mt-0.5 break-all">
            {formatCaseHashrate(contact.nearestCase.hashrateHs)} ·{" "}
            {contact.nearestCase.pool} · {contact.nearestCase.date}
            {contact.nearestCase.height != null && ` · #${contact.nearestCase.height}`}
          </div>
        </div>
      )}

      <div className="text-[10px] text-[var(--muted)] leading-relaxed">
        {t("sourceMath")} · best {formatDifficulty(bestShare)} / net{" "}
        {formatDifficulty(networkDiff)} · {SOLO_WIN_CASES.length} cases
        {contact.overall >= 90 && (
          <span className="text-emerald-500"> · 90%+ alert armed</span>
        )}
      </div>
    </section>
  );
}
