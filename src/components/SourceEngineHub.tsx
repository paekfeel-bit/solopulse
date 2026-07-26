"use client";

/**
 * Unified: Success Source Contact + MAX ENGINE Mechanism Lab
 * One complete panel — shared live inputs, one narrative.
 */

import { useEffect, useMemo, useState } from "react";
import type { LiveTickState } from "@/lib/liveEngine";
import { computeSourceContact } from "@/lib/sourceContact";
import {
  synthesizeMechanism,
  tetrisSlotProgress,
  runMonteCarlo,
} from "@/lib/mechanismEngine";
import { estimateContactEta } from "@/lib/contactEta";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatCaseHashrate } from "@/lib/soloCases";
import { formatDifficulty, formatHashrate, formatHashrateGhs } from "@/lib/mining";
import {
  formatNetworkSharePctFixed,
  formatSciProb,
  calculateSoloProbabilityWithMc,
} from "@/lib/soloProbability";
import { SourceRadar } from "./SourceRadar";
import { EngineCore } from "./EngineCore";
import { BtcDisclaimer } from "./BtcDisclaimer";

function pick(locale: Locale, o: { ko: string; en: string; ja: string }) {
  return o[locale] || o.en;
}

type BlockLite = { height: number; poolName: string; timestamp: number };

export function SourceEngineHub({
  tick,
  hashrateBase,
  bestShare,
  networkDiff,
  networkHashrateHs = 0,
  lastShare,
  authorised,
  shares,
  workers,
  pool,
  foundBlocks = 0,
  deviceOnline,
  hasDevice,
}: {
  tick: LiveTickState | null;
  hashrateBase: number;
  bestShare: number;
  networkDiff: number;
  /** Measured network hashrate H/s (multi-API); 0 → derive from D */
  networkHashrateHs?: number;
  lastShare: number;
  authorised: number;
  shares: number;
  workers: number;
  pool: string;
  foundBlocks?: number;
  deviceOnline?: boolean;
  hasDevice?: boolean;
}) {
  const { locale } = useI18n();
  const [blocks, setBlocks] = useState<BlockLite[]>([]);
  const [now, setNow] = useState(Date.now());
  const [simWave, setSimWave] = useState(0);
  const [activeMethod, setActiveMethod] = useState(0);
  const [tab, setTab] = useState<"overview" | "methods" | "math" | "cases">(
    "overview"
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/blocks?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        setBlocks(
          (j.blocks || []).map(
            (b: { height: number; poolName: string; timestamp: number }) => ({
              height: b.height,
              poolName: b.poolName,
              timestamp: b.timestamp,
            })
          )
        );
      } catch {
        /* */
      }
    };
    load();
    const id = setInterval(load, 5_000);
    const t = setInterval(() => setNow(Date.now()), 400);
    const s = setInterval(() => setSimWave((w) => w + 1), 15_000);
    const m = setInterval(() => setActiveMethod((i) => (i + 1) % 6), 4000);
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
    authorised > 0 ? Math.max(0, now / 1000 - authorised) : 86400;

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
        // Avoid historical foundBlocks counter as "block just found"
        foundBlocks:
          networkDiff > 0 && bestShare >= networkDiff ? foundBlocks : 0,
        deviceOnline,
        nowMs: now,
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
      now,
    ]
  );

  const synth = useMemo(() => {
    const base = synthesizeMechanism({
      hashrateHs: hashrateBase,
      difficulty: networkDiff,
      bestShare,
      uptimeSec: uptime,
      recentBlockIntervalsSec: intervals,
      recentPoolNames: blocks.map((b) => b.poolName),
      networkHashrateHs: networkHashrateHs > 0 ? networkHashrateHs : null,
    });
    const wave = runMonteCarlo({
      hashrateHs: hashrateBase,
      difficulty: networkDiff,
      trials: 20_000,
      seed:
        (Math.floor(hashrateBase / 1e8) ^
          Math.floor(networkDiff / 1e10) ^
          (simWave * 0x9e3779b9)) >>>
        0,
    });
    return { ...base, sim: wave };
  }, [
    hashrateBase,
    networkDiff,
    bestShare,
    uptime,
    intervals,
    blocks,
    simWave,
    networkHashrateHs,
  ]);

  const math = synth.math;
  const mc = synth.sim.full;
  const shareFixed = formatNetworkSharePctFixed(math.networkShare, 12);
  // Full pipeline: p → Poisson → MC(p, days, 20000) → canonical return shape
  const solo30 = calculateSoloProbabilityWithMc(
    math.hashrateTh,
    math.networkHashrateEh,
    30,
    20_000,
    locale === "ja" ? "ja" : locale === "en" ? "en" : "ko"
  );
  const solo365 = calculateSoloProbabilityWithMc(
    math.hashrateTh,
    math.networkHashrateEh,
    365.25,
    20_000,
    locale === "ja" ? "ja" : locale === "en" ? "en" : "ko"
  );

  // Blend: contact overall + consensus for unified "engine alignment"
  const engineAlign = Math.min(
    100,
    contact.overall * 0.45 + synth.consensus * 100 * 0.55
  );

  const eta = useMemo(
    () =>
      estimateContactEta({
        contact,
        hashrateHs: hashrateBase,
        networkDiff,
        bestShare,
        lastShareUnix: lastShare,
        authorisedUnix: authorised,
        shares,
        nowMs: now,
      }),
    [contact, hashrateBase, networkDiff, bestShare, lastShare, authorised, shares, now]
  );

  const lastTs = blocks[0]?.timestamp;
  const since = lastTs ? Math.max(0, Math.floor(now / 1000 - lastTs)) : 0;
  const slot = tetrisSlotProgress(since, 600);
  const th = hashrateBase / 1e12;
  const ticketDots = Math.min(28, Math.max(3, Math.round(th * 5 + 2)));
  const flowDur = Math.max(0.45, Math.min(5, 5 / Math.max(0.25, th || 0.5)));
  const ladder =
    networkDiff > 0
      ? Math.min(100, Math.log10(1 + (bestShare / networkDiff) * 1e15) * 8)
      : 0;

  const offlineDevice = hasDevice && !deviceOnline;

  return (
    <section className="rounded-2xl border border-orange-600/40 bg-gradient-to-b from-[var(--card)] via-[var(--card)] to-zinc-950/30 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden relative min-w-0">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-25">
        <div className="engine-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-amber-500/15 to-transparent" />
      </div>

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-[var(--fg)] leading-snug">
              {locale === "ko"
                ? "소스 엔진"
                : locale === "ja"
                  ? "ソース・エンジン"
                  : "Source Engine"}
            </h2>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse shrink-0">
              LIVE
            </span>
            <BtcDisclaimer className="max-w-full" />
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
            {locale === "ko"
              ? "성공 조건 정렬 + 6경로 합의 · 모든 기기 공통"
              : locale === "ja"
                ? "成功条件整合 + 6経路合意"
                : "Alignment + 6-path consensus"}
          </p>
        </div>
        <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 sm:text-right shrink-0 rounded-lg sm:rounded-none border border-[var(--border)] sm:border-0 bg-[var(--bg)]/60 sm:bg-transparent px-2.5 py-1.5 sm:p-0">
          <div className="text-[9px] text-[var(--muted)] uppercase">align</div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400">
            {engineAlign.toFixed(0)}%
          </div>
          <div className="text-[9px] font-mono text-[var(--muted)] sm:mt-0.5">
            c {contact.overall.toFixed(0)} · e {(synth.consensus * 100).toFixed(0)}
          </div>
        </div>
      </div>

      {offlineDevice && (
        <div className="relative text-[11px] rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-amber-200/90">
          {locale === "ko"
            ? "로컬 기기 오프라인 — 풀 통계로 추적 중 (IP 확인 또는 비워 두기)"
            : locale === "ja"
              ? "ローカル機器オフライン — プール統計で追跡中"
              : "Local device offline — tracking via pool stats"}
        </div>
      )}

      {/* Tabs */}
      <div className="relative flex gap-1 p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] overflow-x-auto">
        {(
          [
            ["overview", locale === "ko" ? "개요" : locale === "ja" ? "概要" : "Overview"],
            ["math", locale === "ko" ? "수식" : locale === "ja" ? "数式" : "Math"],
            ["methods", locale === "ko" ? "6경로" : locale === "ja" ? "6経路" : "6 paths"],
            ["cases", locale === "ko" ? "사례" : locale === "ja" ? "事例" : "Cases"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[3.5rem] text-[11px] font-semibold py-1.5 rounded-md transition whitespace-nowrap ${
              tab === id
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Network share hero — always visible above tabs content */}
      <div className="relative rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-[var(--bg)] to-orange-600/10 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-500/90 font-semibold">
              {locale === "ko" ? "네트워크 점유율 (s = h / H_net)" : "Network share s = h / H_net"}
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-mono font-black text-amber-400 tabular-nums tracking-tight break-all leading-tight">
              {shareFixed}
            </div>
            <div className="mt-1 text-[10px] font-mono text-[var(--muted)] break-all leading-relaxed">
              s = {math.networkShare > 0 ? math.networkShare.toExponential(12) : "0"}
              {" · "}
              {locale === "ko" ? "소수 12자리 %" : "12 d.p. %"}
            </div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <div className="text-[9px] text-[var(--muted)] uppercase">you / net</div>
            <div className="text-[11px] font-mono text-[var(--fg)]">
              {formatHashrate(math.hashrateHs, 2)}
            </div>
            <div className="text-[11px] font-mono text-[var(--muted)]">
              {formatHashrate(math.networkHashrateHs, 2)}
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/80 px-2 py-1.5 min-w-0">
            <div className="text-[8px] text-[var(--muted)]">λ / s</div>
            <div className="text-[10px] font-mono font-bold break-all">
              {math.lambdaPerSec > 0 ? math.lambdaPerSec.toExponential(6) : "0"}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/80 px-2 py-1.5 min-w-0">
            <div className="text-[8px] text-[var(--muted)]">P(hash)</div>
            <div className="text-[10px] font-mono font-bold break-all">
              {math.pHash > 0 ? math.pHash.toExponential(6) : "0"}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/80 px-2 py-1.5 min-w-0">
            <div className="text-[8px] text-[var(--muted)]">E[T]</div>
            <div className="text-[10px] font-mono font-bold text-orange-400 break-all">
              {Number.isFinite(math.expectedYears)
                ? `${math.expectedYears.toFixed(2)}y`
                : "∞"}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/80 px-2 py-1.5 min-w-0">
            <div className="text-[8px] text-[var(--muted)]">P(30d)</div>
            <div className="text-[10px] font-mono font-bold text-emerald-400 break-all">
              {formatSciProb(math.poisson.d30, 5)}
            </div>
          </div>
        </div>
      </div>

      {tab === "overview" && (
        <div className="relative space-y-4">
          {/* Dual viz */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2">
              <div className="text-[10px] font-semibold text-center text-[var(--muted)] mb-1">
                {locale === "ko" ? "성공 소스 접촉" : "Source contact"}
              </div>
              <SourceRadar
                contact={contact}
                hashrateHs={hashrateBase}
                lastShareUnix={lastShare}
              />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2">
              <div className="text-[10px] font-semibold text-center text-[var(--muted)] mb-1">
                MAX ENGINE
              </div>
              <EngineCore synth={synth} slot={slot} secSinceBlock={since} />
            </div>
          </div>

          <div className="rounded-xl border border-amber-600/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
            <div className="font-semibold mb-0.5 flex items-center gap-2 flex-wrap">
              {pick(locale, contact.label)}
              <BtcDisclaimer />
            </div>
            {pick(locale, contact.truth)}
          </div>

          {/* ETA while waiting for 100% */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 sm:p-3 grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="min-w-0">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-snug">
                {locale === "ko" ? "정렬 가능 단계 ETA" : "Fillable steps ETA"}
              </div>
              <div className="text-base font-mono font-bold text-amber-400 break-all leading-snug">
                {eta.achievableLabel}
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-snug">
                → ~{eta.projectedOverallWithoutLottery.toFixed(0)}%{" "}
                {locale === "ko" ? "(복권 제외)" : "(ex-lottery)"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-snug">
                {locale === "ko" ? "사다리 100% (=블록) 기대" : "Ladder 100% EV"}
              </div>
              <div className="text-base font-mono font-bold text-orange-400 break-all leading-snug">
                {eta.full100Label}
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-snug">
                {locale === "ko" ? "Poisson 기대 시간" : "Poisson expected"}
              </div>
            </div>
            <div className="min-w-0 min-[400px]:col-span-2 sm:col-span-1">
              <div className="text-[9px] uppercase text-[var(--muted)] leading-snug">
                {locale === "ko" ? "현재 접촉" : "Contact now"}
              </div>
              <div className="text-base font-mono font-bold text-emerald-400">
                {contact.overall.toFixed(0)}%
              </div>
              <div className="text-[9px] text-[var(--muted)] break-all leading-snug">
                {eta.blockingSteps.length
                  ? `blockers: ${eta.blockingSteps.join(", ")}`
                  : "—"}
              </div>
            </div>
            <p className="min-[400px]:col-span-2 sm:col-span-3 text-[10px] text-[var(--muted)] leading-relaxed break-words">
              {pick(locale, eta.note)}{" "}
              <BtcDisclaimer className="align-middle mt-0.5" />
            </p>
          </div>

          <p className="text-[11px] text-[var(--fg)] leading-relaxed rounded-xl border border-emerald-600/30 bg-emerald-500/10 px-3 py-2">
            {pick(locale, synth.conclusion)}
          </p>

          {/* Contact steps compact */}
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-1.5">
            {contact.steps.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border px-2.5 py-2 min-w-0 overflow-hidden ${
                  s.status === "on"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : s.status === "partial"
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-[var(--border)] bg-[var(--bg)]"
                }`}
              >
                <div className="text-[10px] font-semibold leading-snug line-clamp-2">
                  {pick(locale, s.title)}
                </div>
                <div className="text-[10px] font-mono text-amber-500 mt-0.5 break-all leading-snug">
                  {(s.score * 100).toFixed(0)}%
                  {s.liveValue ? (
                    <span className="text-[var(--muted)]"> · {s.liveValue}</span>
                  ) : null}
                </div>
                <div className="mt-1.5 h-0.5 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-emerald-400"
                    style={{ width: `${s.score * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Tetris + ladder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="font-semibold">
                  {locale === "ko" ? "슬롯 테트리스" : "Slot tetris"}
                </span>
                <span className="font-mono text-amber-500">{since}s</span>
              </div>
              <div className="relative h-20 rounded-lg border border-zinc-800 bg-black/50 overflow-hidden">
                <div className="absolute inset-x-1 bottom-0 flex flex-col-reverse gap-0.5">
                  {blocks.slice(0, 5).map((b) => (
                    <div
                      key={b.height}
                      className="h-3 rounded-sm text-[7px] font-mono text-white/90 px-1 truncate"
                      style={{
                        background: `hsla(${(b.height * 37) % 360},65%,38%,0.85)`,
                      }}
                    >
                      #{b.height} {b.poolName}
                    </div>
                  ))}
                </div>
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[40%] rounded bg-gradient-to-b from-amber-300 to-orange-600 shadow-lg transition-all duration-300"
                  style={{
                    height: `${Math.min(85, slot * 85)}%`,
                    bottom: "12%",
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="font-semibold">bestDiff ladder</span>
                <span className="font-mono text-amber-500">{ladder.toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-800 via-amber-400 to-yellow-200 transition-all duration-700"
                  style={{ width: `${Math.max(2, ladder)}%` }}
                />
                <div className="absolute inset-0 engine-shimmer opacity-30" />
              </div>
              <div className="mt-1 flex justify-between text-[9px] font-mono text-[var(--muted)]">
                <span>{formatDifficulty(bestShare)}</span>
                <span>{formatDifficulty(networkDiff)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-center">
                <div className="rounded border border-[var(--border)] py-1">
                  <div className="text-[8px] text-[var(--muted)]">P(30d)</div>
                  <div className="text-[10px] font-mono font-bold">
                    {synth.trackableSource.pLucky30d.toExponential(2)}
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] py-1">
                  <div className="text-[8px] text-[var(--muted)]">vs min win</div>
                  <div className="text-[10px] font-mono font-bold text-emerald-400">
                    {synth.trackableSource.relativeToWeakestWinner.toFixed(1)}×
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket highway */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="font-semibold">
                {locale === "ko" ? "티켓 하이웨이" : "Ticket highway"}
              </span>
              <span className="font-mono text-amber-500">
                {formatHashrateGhs(hashrateBase, 2)}
              </span>
            </div>
            <div className="relative h-9 rounded-lg bg-black border border-zinc-800 overflow-hidden">
              {Array.from({ length: ticketDots }).map((_, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]"
                  style={{
                    width: 3 + (i % 3),
                    height: 3 + (i % 3),
                    animation: `ticketFlow ${flowDur}s linear infinite`,
                    animationDelay: `${(i / ticketDots) * flowDur}s`,
                    left: "-4%",
                  }}
                />
              ))}
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-mono text-emerald-400">
                TARGET
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "math" && (
        <div className="relative space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2">
            <div className="text-xs font-semibold text-[var(--fg)]">
              {locale === "ko" ? "정규 수식 (Bitcoin PoW)" : "Canonical formulas"}
            </div>
            <ul className="space-y-1.5 text-[11px] font-mono text-[var(--muted)] leading-relaxed">
              <li className="break-all text-amber-400/90">{math.formulas.pHash}</li>
              <li className="break-all text-amber-400/90">{math.formulas.share}</li>
              <li className="break-all text-amber-400/90">{math.formulas.lambda}</li>
              <li className="break-all text-amber-400/90">{math.formulas.poissonT}</li>
              <li className="break-all text-amber-400/90">{math.formulas.expected}</li>
            </ul>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed">
              {locale === "ko"
                ? "점유 s = TH_user×10¹² / (EH_net×10¹⁸). P(T일)=1−e^(−s·T·144). 닫힌식 Poisson = 복권 정석."
                : "s = TH×1e12/(EH×1e18). P(T days)=1−e^(−s·T·144). Closed-form Poisson is exact for memoryless PoW."}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-3">
            <div className="text-xs font-semibold mb-2">
              {locale === "ko" ? "점유율 고정밀" : "Share high precision"}
            </div>
            <div className="text-lg sm:text-xl font-mono font-black text-emerald-400 break-all">
              {shareFixed}
            </div>
            <div className="mt-1 text-[10px] font-mono text-[var(--muted)] break-all">
              fraction s = {math.networkShare.toExponential(14)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="min-w-0">
                <div className="text-[var(--muted)]">h (H/s)</div>
                <div className="break-all">{math.hashrateHs.toExponential(6)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[var(--muted)]">H_net (H/s)</div>
                <div className="break-all">
                  {math.networkHashrateHs.toExponential(6)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[var(--muted)]">D</div>
                <div className="break-all">{formatDifficulty(math.difficulty)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[var(--muted)]">H_net (EH/s)</div>
                <div className="break-all">{math.networkHashrateEh.toFixed(6)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-orange-600/35 bg-orange-500/5 p-3 space-y-2">
            <div className="text-xs font-semibold">
              {locale === "ko"
                ? "Monte Carlo 20,000 trials"
                : "Monte Carlo 20,000 trials"}
            </div>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed">
              {locale === "ko"
                ? "대기시간 T=−ln(U)/λ 역변환 샘플링. 닫힌식 Poisson과 |오차| 표시."
                : "Inverse-CDF sampling T=−ln(U)/λ. Shows |error| vs closed-form Poisson."}
            </p>
            {mc ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">MC P(30d)</div>
                  <div className="text-sm font-mono font-bold text-amber-400">
                    {(mc.rate30d * 100).toFixed(6)}%
                  </div>
                  <div className="text-[9px] font-mono text-[var(--muted)]">
                    math {(mc.closedForm.p30 * 100).toFixed(6)}%
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">MC P(1y)</div>
                  <div className="text-sm font-mono font-bold text-orange-400">
                    {(mc.rate1y * 100).toFixed(6)}%
                  </div>
                  <div className="text-[9px] font-mono text-[var(--muted)]">
                    math {(mc.closedForm.p1y * 100).toFixed(6)}%
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">MC P(10y)</div>
                  <div className="text-sm font-mono font-bold">
                    {(mc.rate10y * 100).toFixed(6)}%
                  </div>
                  <div className="text-[9px] font-mono text-[var(--muted)]">
                    math {(mc.closedForm.p10y * 100).toFixed(6)}%
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">|MC−Pois| 30d</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">
                    {(mc.absErr30d * 100).toExponential(3)} pp
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">p50 wait</div>
                  <div className="text-sm font-mono font-bold">
                    {mc.p50Years != null ? `${mc.p50Years.toFixed(1)}y` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="text-[8px] text-[var(--muted)]">p90 wait</div>
                  <div className="text-sm font-mono font-bold">
                    {mc.p90Years != null ? `${mc.p90Years.toFixed(1)}y` : "—"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-[var(--muted)]">MC loading…</div>
            )}
            <div className="text-[9px] font-mono text-[var(--muted)] space-y-1 leading-relaxed">
              <div className="break-all">
                networkShare = p×100 ={" "}
                <span className="text-amber-400 font-bold">
                  {solo30.networkShare.toFixed(12)}%
                </span>
              </div>
              <div className="break-all">
                p = TH×1e12/(EH×1e18) = {solo30.p.toExponential(10)}
              </div>
              <div className="break-all">
                basicProbability(30d) = 1−e^(−p·30·144) ={" "}
                {formatSciProb(solo30.basicProbability, 6)}
              </div>
              <div className="break-all">
                expectedBlocks(30d) = p·30·144 ={" "}
                {solo30.expectedBlocks.toExponential(6)}
              </div>
              <div className="break-all text-amber-400/90">
                monteCarlo(p, 30d, 20000) hitRate ={" "}
                {(solo30.monteCarlo.hitRate * 100).toFixed(6)}% · |err|={" "}
                {(solo30.monteCarlo.absError * 100).toExponential(3)} pp
              </div>
              <div className="break-all">
                monteCarlo(p, 365d, 20000) ={" "}
                {(solo365.monteCarlo.hitRate * 100).toFixed(6)}% · Poisson ={" "}
                {formatSciProb(solo365.basicProbability, 6)} · E[blocks]=
                {solo365.expectedBlocks.toExponential(4)}
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-orange-200/90 bg-orange-500/10 border border-orange-500/25 rounded-lg px-2.5 py-2">
              {solo30.varianceNote}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold mb-2">
              {locale === "ko" ? "기간별 Poisson P(≥1)" : "Poisson P(≥1) by horizon"}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono">
              {(
                [
                  ["1d", math.poisson.day],
                  ["7d", math.poisson.week],
                  ["30d", math.poisson.d30],
                  ["90d", math.poisson.d90],
                  ["1y", math.poisson.year],
                  ["med", math.medianYears],
                ] as const
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-lg border border-[var(--border)] px-2 py-1.5 min-w-0"
                >
                  <div className="text-[var(--muted)] text-[8px]">{k}</div>
                  <div className="font-bold break-all">
                    {k === "med"
                      ? Number.isFinite(v)
                        ? `${(v as number).toFixed(2)}y`
                        : "∞"
                      : formatSciProb(v as number, 5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "methods" && (
        <div className="relative space-y-2">
          {synth.methods.map((m, i) => {
            const hot = i === activeMethod;
            return (
              <div
                key={m.id}
                className={`rounded-xl border p-2.5 transition-all ${
                  hot
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-[var(--border)] bg-[var(--bg)]"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <div className="text-xs font-semibold">{pick(locale, m.title)}</div>
                  <div className="text-[10px] font-mono text-emerald-500">
                    {(m.supportsConclusion * 100).toFixed(0)}%
                  </div>
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
                  {pick(locale, m.finding)}
                </p>
                <div className="mt-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-600 to-emerald-400"
                    style={{ width: `${m.supportsConclusion * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div>
              <div className="text-[9px] text-[var(--muted)]">MC trials</div>
              <div className="text-sm font-mono font-bold">
                {synth.sim.trials.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--muted)]">≤30d hits</div>
              <div className="text-sm font-mono font-bold text-amber-500">
                {synth.sim.hitsIn30d}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--muted)]">≤1y hits</div>
              <div className="text-sm font-mono font-bold text-orange-400">
                {synth.sim.hitsIn1y}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--muted)]">median</div>
              <div className="text-sm font-mono font-bold">
                {synth.sim.medianHitYears != null
                  ? `${synth.sim.medianHitYears.toFixed(1)}y`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-center">
            <div className="text-[9px] text-[var(--muted)] uppercase">
              {locale === "ko" ? "네트워크 점유 (강조)" : "Network share"}
            </div>
            <div className="text-base sm:text-lg font-mono font-black text-amber-400 break-all">
              {shareFixed}
            </div>
          </div>
        </div>
      )}

      {tab === "cases" && (
        <div className="relative space-y-2">
          <p className="text-[11px] text-[var(--muted)]">
            {locale === "ko"
              ? "당신 해시 이하로 성공한 문서화 사례 — 동일 메커니즘 증거"
              : "Documented wins at ≤ your hashrate"}
          </p>
          {synth.weakerWins.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {synth.weakerWins.map((c) => (
                <div
                  key={c.id}
                  className="shrink-0 w-40 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2"
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
          )}
          <a
            href="/cases"
            className="block text-center text-[11px] font-semibold py-2 rounded-xl border border-amber-500/40 text-amber-400 bg-amber-500/10"
          >
            {locale === "ko"
              ? "2009→현재 전체 소형 마이너 성공 사례 →"
              : "Full small-miner win catalog 2009→now →"}
          </a>
          {contact.nearestCase && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-[10px] text-[var(--muted)] uppercase mb-1">
                {locale === "ko" ? "가장 가까운 사례" : "Nearest case"}
              </div>
              <div className="text-sm font-semibold">{contact.nearestCase.device}</div>
              <div className="text-[11px] font-mono text-[var(--muted)]">
                {formatCaseHashrate(contact.nearestCase.hashrateHs)} ·{" "}
                {contact.nearestCase.pool} · {contact.nearestCase.date}
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-1">
                {contact.nearestCase.notes}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-[var(--muted)] max-w-md leading-relaxed">
          {locale === "ko"
            ? "주소만으로 풀 추적 가능 · 기기 IP는 선택(실측 해시). 정렬 100% ≠ BTC."
            : "Pool tracking works with address only · device IP optional."}
        </p>
        <BtcDisclaimer />
      </div>
    </section>
  );
}
