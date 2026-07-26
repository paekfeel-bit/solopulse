"use client";

import { useEffect, useMemo, useState } from "react";
import { synthesizeMechanism, tetrisSlotProgress, runMonteCarlo } from "@/lib/mechanismEngine";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatCaseHashrate } from "@/lib/soloCases";
import { formatHashrateGhs, formatDifficulty } from "@/lib/mining";
import { EngineCore } from "./EngineCore";
import { BtcDisclaimer } from "./BtcDisclaimer";

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

type BlockLite = {
  height: number;
  poolName: string;
  timestamp: number;
};

/**
 * MAX ENGINE — multi-method mechanism synthesis + dynamic live viz.
 * All motion tied to real h, D, bestShare, blocks.
 */
export function MechanismLab({
  hashrateHs,
  difficulty,
  bestShare,
  uptimeSec,
  authorisedUnix,
}: {
  hashrateHs: number;
  difficulty: number;
  bestShare: number;
  uptimeSec?: number;
  authorisedUnix?: number;
}) {
  const { locale } = useI18n();
  const [blocks, setBlocks] = useState<BlockLite[]>([]);
  const [now, setNow] = useState(Date.now());
  const [simWave, setSimWave] = useState(0);
  const [activeMethod, setActiveMethod] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/blocks?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        const list = (j.blocks || []).map(
          (b: { height: number; poolName: string; timestamp: number }) => ({
            height: b.height,
            poolName: b.poolName,
            timestamp: b.timestamp,
          })
        );
        setBlocks(list);
      } catch {
        /* */
      }
    };
    load();
    const id = setInterval(load, 10_000);
    const t = setInterval(() => setNow(Date.now()), 250);
    // Re-seed MC periodically with live entropy from clock + hashrate
    const s = setInterval(() => setSimWave((w) => w + 1), 15_000);
    const m = setInterval(
      () => setActiveMethod((i) => (i + 1) % 6),
      4000
    );
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(t);
      clearInterval(s);
      clearInterval(m);
    };
  }, []);

  const intervals = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < blocks.length - 1; i++) {
      out.push(blocks[i].timestamp - blocks[i + 1].timestamp);
    }
    return out;
  }, [blocks]);

  const uptime =
    uptimeSec ??
    (authorisedUnix && authorisedUnix > 0
      ? Math.max(0, now / 1000 - authorisedUnix)
      : 86400);

  const synth = useMemo(() => {
    const base = synthesizeMechanism({
      hashrateHs,
      difficulty,
      bestShare,
      uptimeSec: uptime,
      recentBlockIntervalsSec: intervals,
      recentPoolNames: blocks.map((b) => b.poolName),
    });
    // MC wave every 15s — Poisson math, re-seeded (not every frame)
    const wave = runMonteCarlo({
      hashrateHs,
      difficulty,
      trials: 8000,
      seed:
        (Math.floor(hashrateHs / 1e8) ^
          Math.floor(difficulty / 1e10) ^
          (simWave * 0x9e3779b9)) >>>
        0,
    });
    return { ...base, sim: wave };
  }, [hashrateHs, difficulty, bestShare, uptime, intervals, blocks, simWave]);

  const lastTs = blocks[0]?.timestamp;
  const since = lastTs ? Math.max(0, Math.floor(now / 1000 - lastTs)) : 0;
  const slot = tetrisSlotProgress(since, 600);

  const th = hashrateHs / 1e12;
  const ticketDots = Math.min(32, Math.max(4, Math.round(th * 5 + 2)));
  const flowDur = Math.max(0.45, Math.min(5, 5 / Math.max(0.4, th)));

  // bestDiff ladder height (log) for live bar
  const ladder =
    difficulty > 0
      ? Math.min(100, Math.log10(1 + (bestShare / difficulty) * 1e15) * 8)
      : 0;

  return (
    <section className="rounded-2xl border border-orange-600/45 bg-gradient-to-b from-[var(--card)] to-zinc-950/40 p-4 space-y-4 overflow-hidden relative">
      {/* Ambient scan line */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        <div className="engine-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-amber-500/15 to-transparent" />
      </div>

      <div className="relative flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--fg)]">
              {locale === "ko"
                ? "MAX ENGINE · 메커니즘 랩"
                : locale === "ja"
                  ? "MAX ENGINE · メカニズム"
                  : "MAX ENGINE · Mechanism Lab"}
            </h2>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse">
              LIVE
            </span>
            <BtcDisclaimer />
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
            {locale === "ko"
              ? "6경로 동시 공략 · 실측 해시/난이도 · Poisson 시뮬 · 슬롯 테트리스"
              : locale === "ja"
                ? "6経路同時 · 実測ハッシュ/難易度 · Poisson · スロット"
                : "6-path assault · live h/D · Poisson sim · slot tetris"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] text-[var(--muted)] uppercase">consensus</div>
          <div className="text-2xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-emerald-400">
            {(synth.consensus * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Consensus conclusion */}
      <div className="relative rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 overflow-hidden">
        <div className="absolute inset-0 engine-shimmer opacity-20" />
        <div className="relative flex flex-wrap items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase text-emerald-400">
            {locale === "ko" ? "합의 결론" : locale === "ja" ? "合意結論" : "Consensus"}
          </span>
          <BtcDisclaimer />
        </div>
        <p className="relative text-[11px] text-[var(--fg)] leading-relaxed">
          {pick(locale, synth.conclusion)}
        </p>
      </div>

      {/* Dual column: engine core + tetris */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <EngineCore synth={synth} slot={slot} secSinceBlock={since} />

        <div className="space-y-3">
          {/* Tetris well */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold">
                {locale === "ko"
                  ? "슬롯 테트리스"
                  : locale === "ja"
                    ? "スロット・テトリス"
                    : "Slot tetris"}
              </div>
              <div className="text-[10px] font-mono text-amber-500">{since}s / 600s</div>
            </div>
            <div className="relative h-28 rounded-lg border border-zinc-800 bg-black/60 overflow-hidden">
              {/* Grid lines */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-t border-zinc-800/60"
                  style={{ top: `${(i + 1) * (100 / 7)}%` }}
                />
              ))}
              {/* Stacked blocks */}
              <div className="absolute inset-x-1 bottom-0 flex flex-col-reverse gap-0.5">
                {blocks.slice(0, 6).map((b, i) => (
                  <div
                    key={b.height}
                    className="h-3.5 rounded-sm flex items-center px-1 text-[8px] font-mono text-white/90 truncate transition-all"
                    style={{
                      background: `linear-gradient(90deg, hsla(${(b.height * 37) % 360},70%,40%,0.9), hsla(${(b.height * 37 + 40) % 360},70%,30%,0.75))`,
                      animation: `tetrisLand 0.4s ease-out ${i * 0.05}s both`,
                    }}
                    title={`#${b.height} ${b.poolName}`}
                  >
                    #{b.height} {b.poolName}
                  </div>
                ))}
              </div>
              {/* Dropping piece */}
              <div
                className="absolute left-1/2 -translate-x-1/2 w-[42%] rounded-md bg-gradient-to-b from-amber-300 via-orange-500 to-orange-700 shadow-[0_0_20px_rgba(251,146,60,0.5)] transition-all duration-300"
                style={{
                  height: `${Math.min(88, slot * 88)}%`,
                  bottom: `${8 + Math.min(6, blocks.length) * 3.5}%`,
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.15),transparent)] animate-pulse" />
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-600 via-amber-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(100, slot * 100)}%` }}
              />
            </div>
          </div>

          {/* bestDiff ladder live */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="font-semibold">
                {locale === "ko" ? "bestDiff 사다리" : "bestDiff ladder"}
              </span>
              <span className="font-mono text-amber-500">{ladder.toFixed(1)}%</span>
            </div>
            <div className="relative h-3 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-800 via-amber-500 to-yellow-300 transition-all duration-700"
                style={{ width: `${Math.max(2, ladder)}%` }}
              />
              <div className="absolute inset-0 engine-shimmer opacity-40" />
            </div>
            <div className="mt-1 flex justify-between text-[9px] font-mono text-[var(--muted)]">
              <span>{formatDifficulty(bestShare)}</span>
              <span>→ {formatDifficulty(difficulty)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket highway */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold">
            {locale === "ko"
              ? "티켓 하이웨이 (실측 → 네트워크 타겟)"
              : locale === "ja"
                ? "チケット・ハイウェイ"
                : "Ticket highway (live → network target)"}
          </div>
          <span className="text-[10px] font-mono text-amber-500">
            {formatHashrateGhs(hashrateHs, 2)}
          </span>
        </div>
        <div className="relative h-10 rounded-lg bg-black border border-zinc-800 overflow-hidden">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_12px,rgba(245,158,11,0.04)_12px,rgba(245,158,11,0.04)_13px)]" />
          {Array.from({ length: ticketDots }).map((_, i) => (
            <span
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]"
              style={{
                width: 4 + (i % 3),
                height: 4 + (i % 3),
                animation: `ticketFlow ${flowDur}s linear infinite`,
                animationDelay: `${(i / ticketDots) * flowDur}s`,
                left: "-4%",
              }}
            />
          ))}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400/90 bg-black/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
            TARGET
          </div>
        </div>
      </div>

      {/* Trackable meters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Meter
          label={locale === "ko" ? "티켓/초" : "Tickets/s"}
          value={formatHashrateGhs(synth.trackableSource.ticketsPerSec, 2)}
          flash
        />
        <Meter
          label={locale === "ko" ? "30일 운" : "P(30d)"}
          value={synth.trackableSource.pLucky30d.toExponential(3)}
        />
        <Meter
          label={locale === "ko" ? "1년 운" : "P(1y)"}
          value={(synth.trackableSource.pLucky1y * 100).toFixed(4) + "%"}
        />
        <Meter
          label={locale === "ko" ? "최약승자比" : "vs min win"}
          value={synth.trackableSource.relativeToWeakestWinner.toFixed(2) + "×"}
        />
      </div>

      {/* 6 methods — highlight cycling */}
      <div className="space-y-1.5">
        {synth.methods.map((m, i) => {
          const hot = i === activeMethod;
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-2.5 transition-all duration-500 ${
                hot
                  ? "border-amber-500/60 bg-amber-500/10 scale-[1.01] shadow-lg shadow-amber-900/20"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="text-xs font-semibold text-[var(--fg)]">
                  {pick(locale, m.title)}
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    hot ? "text-amber-400" : "text-emerald-500"
                  }`}
                >
                  {(m.supportsConclusion * 100).toFixed(0)}%
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {pick(locale, m.finding)}
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    hot
                      ? "bg-gradient-to-r from-amber-400 to-orange-500"
                      : "bg-gradient-to-r from-orange-700 to-emerald-500"
                  }`}
                  style={{ width: `${m.supportsConclusion * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* MC live strip */}
      <div className="rounded-xl border border-orange-800/40 bg-gradient-to-r from-orange-950/40 to-[var(--bg)] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">
            {locale === "ko"
              ? "Poisson 몬테카를로 (15s 재시드)"
              : "Poisson MC (re-seed 15s)"}
          </span>
          <span className="text-[9px] font-mono text-[var(--muted)]">wave #{simWave}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-[9px] text-[var(--muted)]">trials</div>
            <div className="text-sm font-mono font-bold">{synth.sim.trials}</div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--muted)]">≤30d</div>
            <div className="text-sm font-mono font-bold text-amber-500">
              {synth.sim.hitsIn30d}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--muted)]">≤1y</div>
            <div className="text-sm font-mono font-bold text-orange-400">
              {synth.sim.hitsIn1y}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--muted)]">median</div>
            <div className="text-sm font-mono font-bold">
              {synth.sim.medianHitYears != null
                ? `${synth.sim.medianHitYears.toFixed(0)}y`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {synth.weakerWins.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 overflow-x-auto">
          <div className="text-xs font-semibold mb-2">
            {locale === "ko"
              ? "당신 ≤ 해시 성공 사례 (메커니즘 증거)"
              : "Wins ≤ your hashrate"}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {synth.weakerWins.map((c) => (
              <div
                key={c.id}
                className="shrink-0 w-36 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2"
              >
                <div className="text-[10px] font-semibold truncate">{c.device}</div>
                <div className="text-xs font-mono text-amber-400">
                  {formatCaseHashrate(c.hashrateHs)}
                </div>
                <div className="text-[9px] text-[var(--muted)] truncate">
                  {c.pool} · {c.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--muted)] leading-relaxed max-w-lg">
          best {formatDifficulty(bestShare)} · D {formatDifficulty(difficulty)} ·{" "}
          {locale === "ko"
            ? "지수 대기시간 샘플링 = 정확한 Poisson (가짜 연출 아님)."
            : "Exact exponential waits = true Poisson."}
        </p>
        <BtcDisclaimer />
      </div>
    </section>
  );
}

function Meter({
  label,
  value,
  flash,
}: {
  label: string;
  value: string;
  flash?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 min-w-0 overflow-hidden ${
        flash ? "ring-1 ring-amber-500/20" : ""
      }`}
    >
      <div className="text-[9px] uppercase text-[var(--muted)] truncate">{label}</div>
      <div className="text-sm font-mono font-bold text-[var(--fg)] break-all leading-tight">
        {value}
      </div>
    </div>
  );
}
