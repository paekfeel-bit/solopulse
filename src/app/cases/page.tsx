"use client";

import Link from "next/link";
import { getCaseCatalog, formatCaseHashrate, type SoloWinCase } from "@/lib/soloCases";
import { useI18n, localeButtonLabel } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { BtcDisclaimer } from "@/components/BtcDisclaimer";
import { useMemo, useState } from "react";

export default function CasesPage() {
  const { locale, cycleLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const [era, setEra] = useState<string>("all");
  const all = useMemo(() => getCaseCatalog(), []);
  const eras = useMemo(
    () => ["all", ...Array.from(new Set(all.map((c) => c.era)))],
    [all]
  );
  const list = era === "all" ? all : all.filter((c) => c.era === era);

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] pb-16">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-sm"
            >
              ⚡
            </Link>
            <div>
              <div className="text-sm font-bold">
                {locale === "ko" ? "소형 마이너 성공 사례" : "Small miner wins"}
              </div>
              <div className="text-[10px] text-[var(--muted)]">2009 → now</div>
            </div>
          </div>
          <div className="flex gap-1.5 items-center">
            <BtcDisclaimer className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={cycleLocale}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)]"
            >
              {localeButtonLabel(locale)}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)]"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <Link
              href="/hub"
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)]"
            >
              Hub
            </Link>
            <Link
              href="/"
              className="text-[10px] px-2 py-1 rounded-lg border border-amber-500/40 text-amber-400"
            >
              App
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 pt-4 space-y-3">
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          {locale === "ko"
            ? "시대별 ‘소형/홈’ 규모 솔로 성공 사례. 메커니즘은 전부 동일: 해시 1회 = 동일 복권 티켓."
            : "Era-relative small/home solo wins. Same mechanism every time: one hash = one lottery ticket."}
        </p>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {eras.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEra(e)}
              className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border ${
                era === e
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {e === "all" ? (locale === "ko" ? "전체" : "All") : e}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {list.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      </main>
    </div>
  );
}

function CaseCard({ c }: { c: SoloWinCase }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{c.device}</div>
          <div className="text-[10px] font-mono text-amber-400 mt-0.5">
            {formatCaseHashrate(c.hashrateHs)} · {c.pool}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-mono text-[var(--muted)]">{c.date}</div>
          {c.height != null && (
            <a
              href={`https://mempool.space/block/${c.height}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-amber-500"
            >
              #{c.height} ↗
            </a>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]">
          {c.era}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]">
          {c.class}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          ≈{c.rewardBtc} BTC
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">{c.notes}</p>
    </article>
  );
}
