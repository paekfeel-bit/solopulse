"use client";

import { useEffect, useMemo, useState } from "react";
import { useMinerDashboard } from "@/hooks/useMinerDashboard";
import {
  formatHashrateGhs,
  formatDifficulty,
  formatTimeAgo,
  formatUnix,
  toGHs,
} from "@/lib/mining";
import { selectStableHashrate } from "@/lib/hashrate";
import {
  clearStoredAddress,
  pushSample,
  loadHistory,
  getStoredPool,
  setStoredPool,
  getStoredDeviceIp,
  setStoredDeviceIp,
  rememberLastAddress,
  normalizeDeviceHost,
} from "@/lib/history";
import { POOL_OPTIONS } from "@/lib/pools";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { useDeviceHashrate } from "@/hooks/useDeviceHashrate";
import { useAgentTelemetry } from "@/hooks/useAgentTelemetry";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n, localeButtonLabel, localeExitLabel } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { pickDisplayHashrate } from "@/lib/hashrate";
import { parseDeviceTarget } from "@/lib/deviceClient";
import { StatCard } from "./StatCard";
import { LiveOddsPanel } from "./LiveOddsPanel";
import { SoloCasePanel } from "./SoloCasePanel";
import { SourceEngineHub } from "./SourceEngineHub";
import { SourceEngineLive } from "./SourceEngineLive";
import { AnalogGauge } from "./AnalogGauge";
import { hashrateGaugeScale } from "@/lib/gaugeScale";
import { VersionBadge } from "./VersionBadge";
import {
  buildEnhancedBundle,
  loadBestShareTrend,
  pushBestShareSample,
} from "@/lib/mechanismEnhanced";
import { BestShareBar } from "./BestShareBar";
import { HashrateChart } from "./HashrateChart";
import { BtcHourlyChart } from "./BtcHourlyChart";
import { DifficultyChart } from "./DifficultyChart";
import { NetworkBar } from "./NetworkBar";
import { MempoolBlocks } from "./MempoolBlocks";
import { Celebration } from "./Celebration";
import { ConnectionLight } from "./ConnectionLight";
import { NotifyBell } from "./NotifyBell";
import { LightningTip } from "./LightningTip";
import { BottomNav, type DashTab } from "./BottomNav";

interface Props {
  address: string;
  onLogout: () => void;
}

export function Dashboard({ address, onLogout }: Props) {
  const { t, cycleLocale, locale } = useI18n();
  const { theme, toggle } = useTheme();
  const dash = useMinerDashboard(address);
  /**
   * Mining monitor from ANY internet = pool API (works on mobile data).
   * Optional board: public HTTPS tunnel URL, or agent stream if home PC bridge is on.
   * Private LAN IP only works on same Wi‑Fi (browser limit) — never required.
   */
  const deviceHr = useDeviceHashrate(true, address);
  const agent = useAgentTelemetry(true, address);
  const [tab, setTab] = useState<DashTab>("home");
  const [celebrateOpen, setCelebrateOpen] = useState(true);
  const [localHistory, setLocalHistory] = useState(() => loadHistory(address));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [boardHostDraft, setBoardHostDraft] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() || "" : ""
  );
  const [boardBusy, setBoardBusy] = useState(false);
  /** Adaptive hashrate gauge peak. */
  const [gaugePeakGhs, setGaugePeakGhs] = useState(0);

  // 1s UI clock — age labels + force re-read of sticky age
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const poolHr = useMemo(() => {
    if (!dash.user) {
      return {
        displayHs: 0,
        instantHs: 0,
        stableHs: 0,
        source: "5m" as const,
        raw: { m1: 0, m5: 0, h1: 0, d1: 0 },
      };
    }
    return selectStableHashrate(dash.user);
  }, [dash.user]);

  /** Pool 1m preferred — works from mobile data / any network */
  const poolHsLive =
    poolHr.displayHs || poolHr.instantHs || poolHr.stableHs || 0;
  const poolWindowLabel =
    poolHr.raw.m1 > 0 ? "1m" : poolHr.source === "blend" ? "5m" : poolHr.source;

  const deviceHsLive = (() => {
    if (agent.hasLiveHashrate && agent.hashRateHs > 0) return agent.hashRateHs;
    if (agent.hasLiveHashrate && agent.hashRateGhs > 0)
      return agent.hashRateGhs * 1e9;
    if (
      agent.telemetry &&
      agent.staleMs < 300_000 &&
      (agent.hashRateHs > 0 || agent.hashRateGhs > 0)
    ) {
      return agent.hashRateHs > 0
        ? agent.hashRateHs
        : agent.hashRateGhs * 1e9;
    }
    const d = deviceHr.device;
    if (!d || !d.online) return 0;
    const ghs = Number(d.hashRateGhs);
    if (Number.isFinite(ghs) && ghs > 0) return ghs * 1e9;
    const hs = Number(d.hashRateHs);
    return Number.isFinite(hs) && hs > 0 ? hs : 0;
  })();
  const boardLive = deviceHsLive > 0;
  const picked = pickDisplayHashrate({
    deviceOnline: boardLive,
    deviceHs: deviceHsLive,
    poolStableHs: poolHsLive,
  });
  /** Board if available, else pool — both feed source engine */
  const shownHs = picked.hs;
  const engineHs = boardLive ? deviceHsLive : poolHsLive > 0 ? poolHsLive : 0;
  const miningLive = engineHs > 0;
  const hrSource = boardLive ? ("device" as const) : ("pool" as const);

  // Connection light = pool health (any internet)
  const heartbeatOk =
    dash.loading && !dash.user
      ? null
      : dash.error && !dash.user
        ? false
        : !dash.error || !!dash.user || poolHsLive > 0 || miningLive;
  const { status } = useOnlineStatus(heartbeatOk);

  const bestForLadder = Number(dash.user?.bestshare || 0);
  const bestShare = Math.max(bestForLadder, Number(dash.user?.bestever || 0));
  const difficulty = Number(dash.network?.difficulty) || 0;

  // v2.5 enhanced bundle for SourceEngineLive viz
  const engineEnhanced = useMemo(() => {
    if (!(difficulty > 0)) return null;
    const hs = engineHs > 0 ? engineHs : shownHs;
    if (!(hs > 0) || !(difficulty > 0)) return null;
    const best = bestForLadder || bestShare;
    if (best > 0) pushBestShareSample(best);
    const trend = loadBestShareTrend();
    const expYears =
      hs > 0 && difficulty > 0
        ? (difficulty * Math.pow(2, 32)) / (hs * 86400 * 365.25)
        : Infinity;
    return buildEnhancedBundle({
      hashrateHs: hs,
      difficulty,
      bestShare: best,
      expectedYears: expYears,
      bestShareTrend: trend,
      baseReward: Number(dash.network?.blockReward) || 3.125,
    });
  }, [
    engineHs,
    shownHs,
    difficulty,
    bestForLadder,
    bestShare,
    dash.network?.blockReward,
    nowTick,
  ]);

  const liveTick = useLiveOdds({
    hashrateBase: engineHs > 0 ? engineHs : shownHs,
    difficulty,
    bestShare: bestForLadder || bestShare,
    active: miningLive && difficulty > 0,
  });

  // Reset chart when address changes
  useEffect(() => {
    setLocalHistory(loadHistory(address));
  }, [address]);

  useEffect(() => {
    if (dash.celebration) setCelebrateOpen(true);
  }, [dash.celebration]);

  // Pool hashrate chart samples
  useEffect(() => {
    const poolHs = poolHr.displayHs || poolHr.instantHs || poolHr.stableHs;
    if (poolHs <= 0) return;
    setLocalHistory((prev) => pushSample(address, toGHs(poolHs), prev));
  }, [
    address,
    poolHr.displayHs,
    poolHr.instantHs,
    poolHr.stableHs,
    dash.lastUpdated,
  ]);

  const shortAddr =
    address.length > 16
      ? `${address.slice(0, 8)}…${address.slice(-6)}`
      : address;
  const chartSamples = localHistory.length > 0 ? localHistory : dash.history;

  function logout() {
    rememberLastAddress(address);
    clearStoredAddress();
    onLogout();
  }

  async function handleRefresh() {
    await Promise.all([
      dash.refresh(),
      agent.refresh(),
      deviceHr.hasDevice ? deviceHr.refresh() : Promise.resolve(),
    ]);
  }

  async function handleBoardHostApply() {
    const raw = boardHostDraft.trim();
    setBoardBusy(true);
    try {
      if (!raw) {
        setStoredDeviceIp("");
        deviceHr.setIp("");
        return;
      }
      const host = normalizeDeviceHost(raw) || raw;
      setStoredDeviceIp(host);
      setBoardHostDraft(host);
      // Silent check only — no popups / navigation
      await deviceHr.connect(host);
      await agent.refresh();
    } finally {
      setBoardBusy(false);
    }
  }

  const boardHostHint = (() => {
    const raw = boardHostDraft.trim();
    if (!raw) {
      return locale === "ko"
        ? "비워두면 풀만 사용 (모바일 데이터 OK). 보드 실측은 https:// 공개 터널 URL 권장."
        : "Empty = pool only (mobile data OK). For board stats use a public https:// tunnel URL.";
    }
    const t = parseDeviceTarget(raw);
    if (t?.privateLan) {
      return locale === "ko"
        ? "사설 LAN IP는 같은 Wi‑Fi에서만 가능. 모바일 데이터에서는 풀 수치가 정확 기준입니다."
        : "Private LAN IP only on same Wi‑Fi. On mobile data, pool figures are the accurate baseline.";
    }
    if (t && !t.privateLan) {
      return locale === "ko"
        ? "공개 터널/URL — 어느 인터넷에서도 보드 실측 시도"
        : "Public tunnel/URL — board stats from any network";
    }
    return locale === "ko" ? "주소 형식 확인" : "Check address format";
  })();

  // Adaptive hashrate gauge peak from pool
  useEffect(() => {
    const ghs = shownHs > 0 ? shownHs / 1e9 : 0;
    if (ghs > 0) setGaugePeakGhs((p) => Math.max(p, ghs));
  }, [shownHs]);

  const hashScale = hashrateGaugeScale(
    shownHs > 0 ? shownHs / 1e9 : 0,
    gaugePeakGhs
  );
  const workerCount = Number(dash.user?.workers || 0);
  const bestShareLog =
    bestShare > 1 ? Math.min(100, Math.log10(bestShare) * 10) : 0;

  if (dash.loading && !dash.user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--muted)]">{t("scanning")}</p>
          <ConnectionLight status={status} />
        </div>
      </div>
    );
  }

  if (dash.error && !dash.user) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-5 bg-[var(--bg)]">
        <div className="max-w-md w-full rounded-2xl border border-red-900/40 bg-[var(--card)] p-6 text-center space-y-4">
          <ConnectionLight status="offline" />
          <p className="text-red-400 text-sm break-words">{dash.error}</p>
          <p className="text-xs text-[var(--muted)]">{t("errorMiner")}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-lg bg-[var(--border)] px-4 py-2 text-sm text-[var(--fg)]"
            >
              {t("retry")}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              {localeExitLabel(locale)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const u = dash.user!;
  const net = dash.network;

  const toolBtn =
    "sp-tool-glow inline-flex items-center justify-center h-8 px-2.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--muted)] shrink-0 leading-none";

  return (
    <div className="relative min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] bg-[var(--bg)] text-[var(--fg)] overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="sp-shell py-2 space-y-2">
          {/* Row 1: brand + status */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-700 via-amber-500 to-stone-800 flex items-center justify-center text-sm shrink-0 border border-amber-600/40">
              ◎
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="text-sm font-bold leading-tight shrink-0 tracking-tight">
                  Solo<span className="text-amber-500">Pulse</span>{" "}
                  <span className="text-[9px] font-normal text-[var(--fg)]0 tracking-[0.2em] uppercase">
                    Intelligence
                  </span>
                  <VersionBadge className="ml-1.5" />
                </div>
                <ConnectionLight status={status} />
              </div>
              <div className="text-[10px] font-mono text-[var(--muted)] truncate max-w-full">
                {shortAddr}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={dash.refreshing}
              title={t("refresh")}
              className={`${toolBtn} sm:hidden ${dash.refreshing ? "opacity-60" : ""}`}
            >
              <span className={dash.refreshing ? "inline-block animate-spin" : ""}>↻</span>
            </button>
          </div>
          {/* Row 2: actions — wrap cleanly, no squeezed single row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={cycleLocale} className={toolBtn}>
              {localeButtonLabel(locale)}
            </button>
            <button
              type="button"
              onClick={toggle}
              className={toolBtn}
              title={theme === "dark" ? t("light") : t("dark")}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <NotifyBell />
            <a href="/hub" className={toolBtn}>
              Hub
            </a>
            <a href="/cases" className={toolBtn}>
              Cases
            </a>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={dash.refreshing}
              title={t("refresh")}
              className={`${toolBtn} hidden sm:inline-flex ${
                dash.refreshing ? "opacity-60" : ""
              }`}
            >
              <span className={dash.refreshing ? "inline-block animate-spin" : ""}>↻</span>
            </button>
            <a
              href="https://x.com/medbedeee"
              target="_blank"
              rel="noopener noreferrer"
              className={toolBtn}
              title={t("feedback")}
            >
              𝕏
            </a>
            <LightningTip variant="header" />
            <button type="button" onClick={logout} className={`${toolBtn} ml-auto`}>
              {localeExitLabel(locale)}
            </button>
          </div>
        </div>
      </header>

      <main className="sp-shell sp-stack pt-3 w-full min-w-0">
        {dash.error && (
          <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 break-words">
            {dash.error}
          </div>
        )}

        {/* ===== TAB: home (gauges + network) — first screen ===== */}
        {tab === "home" && (
          <div className="relative space-y-3 overflow-hidden">
            {/* Soft amber scan bar — same as engine, home only */}
            <div
              className="engine-scan pointer-events-none absolute inset-x-0 z-10 h-14 bg-gradient-to-b from-transparent via-amber-500/12 to-transparent"
              aria-hidden
            />
        {/* Mining contact — works on mobile data via pool */}
        <div
          className={`relative z-[1] rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${
            miningLive
              ? "border-emerald-600/50 bg-emerald-950/40 text-emerald-300"
              : "border-red-800/50 bg-red-950/30 text-red-300"
          }`}
        >
          <span className="relative flex h-3 w-3 shrink-0">
            {miningLive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                miningLive ? "bg-emerald-400" : "bg-red-500"
              }`}
            />
          </span>
          <div className="min-w-0 text-[11px] font-mono leading-snug">
            {miningLive
              ? locale === "ko"
                ? `채굴 LIVE · ${formatHashrateGhs(engineHs, 2)} · ${
                    hrSource === "device" ? "보드" : `풀 ${poolWindowLabel}`
                  } · 소스엔진 ON · 어디서나`
                : `MINING LIVE · ${formatHashrateGhs(engineHs, 2)} · ${
                    hrSource === "device" ? "board" : `pool ${poolWindowLabel}`
                  } · engine ON · any network`
              : locale === "ko"
                ? "채굴 신호 없음 · 지갑+풀 확인 (모바일 데이터에서도 동일)"
                : "No mining signal · check wallet+pool (same on mobile data)"}
          </div>
        </div>

        {/* Analog instrument cluster — retro hi-fi panel (light + dark) */}
        <section className="sp-retro-cluster p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-700 dark:text-amber-500 font-semibold">
              SoloPulse · ANALOG CLUSTER
            </div>
            <div
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                miningLive
                  ? "border-emerald-600/50 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                  : dash.loading
                    ? "border-amber-600/50 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                    : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {miningLive
                ? locale === "ko"
                  ? hrSource === "device"
                    ? "LIVE · 보드"
                    : `LIVE · 풀 ${poolWindowLabel}`
                  : hrSource === "device"
                    ? "LIVE · BOARD"
                    : `LIVE · POOL ${poolWindowLabel}`
                : dash.loading
                  ? "…"
                  : "IDLE"}
            </div>
          </div>
          <div className="flex flex-wrap justify-around items-start gap-3 sm:gap-5 overflow-visible pb-1">
            <AnalogGauge
              value={hashScale.value}
              min={0}
              max={hashScale.max}
              label="HASHRATE"
              unit={hashScale.unit}
              live={miningLive}
              decimals={hashScale.decimals}
            />
            <AnalogGauge
              value={bestShareLog}
              min={0}
              max={100}
              label="BEST SHARE"
              unit="log"
              live={bestShare > 0}
              decimals={1}
            />
            <AnalogGauge
              value={workerCount}
              min={0}
              max={Math.max(4, workerCount + 1)}
              label="WORKERS"
              unit=""
              live={workerCount > 0}
              decimals={0}
            />
          </div>
          <div className="sp-retro-hash-readout mt-2 text-center font-mono text-2xl sm:text-3xl tabular-nums tracking-tight font-bold">
            {shownHs > 0 ? formatHashrateGhs(shownHs, 2) : "—"}
            <span className="text-sm text-amber-700 dark:text-amber-500 ml-2 font-semibold">
              {hrSource === "device" ? "BOARD" : `POOL ${poolWindowLabel}`}
            </span>
          </div>
          <div className="sp-retro-meta text-center text-[10px] font-mono mt-1 break-all space-y-0.5">
            <div>
              pool 1m {u.hashrate1m || "—"} · 5m {u.hashrate5m || "—"} · 1h{" "}
              {u.hashrate1hr || "—"}
            </div>
            {boardLive && (
              <div className="text-emerald-600 dark:text-emerald-400">
                board {(deviceHsLive / 1e12).toFixed(2)} TH/s ·{" "}
                {agent.hostIp || deviceHr.device?.ip || "—"}
              </div>
            )}
          </div>
        </section>

        {/* ① Hashrate detail + legacy controls */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {locale === "ko" ? "풀 해시레이트" : "Pool hashrate"}
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        miningLive ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        miningLive ? "bg-emerald-500" : "bg-zinc-500"
                      }`}
                    />
                  </span>
                </span>
              </div>

              <div className="text-[10px] font-mono text-[var(--muted)] leading-relaxed break-all">
                <span className="text-amber-500">POOL</span>{" "}
                <span className="text-emerald-500/90">1m {u.hashrate1m || "—"}</span>
                {" · "}5m {u.hashrate5m || "—"} · 1h {u.hashrate1hr || "—"} · 1d{" "}
                {u.hashrate1d || "—"}
                <span className="block text-[9px] mt-0.5 text-[var(--muted)]">
                  {locale === "ko"
                    ? "표시 기준: 1분 해시 (가장 최근). 5분은 평균이라 더 낮게 보일 수 있음. 모바일 데이터에서도 동일."
                    : "Headline uses 1m (most recent). 5m is smoother/lower. Same on mobile data."}
                </span>
              </div>

              {/* Optional board host — tunnel works off home Wi‑Fi */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 space-y-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[var(--muted)] font-semibold">
                  {locale === "ko"
                    ? "보드 주소 (선택)"
                    : "Board host (optional)"}
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5">
                  <input
                    type="text"
                    value={boardHostDraft}
                    onChange={(e) => setBoardHostDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleBoardHostApply();
                      }
                    }}
                    placeholder="https://xxxx.trycloudflare.com 또는 172.x.x.x"
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-xs font-mono text-[var(--fg)]"
                  />
                  <button
                    type="button"
                    disabled={boardBusy}
                    onClick={() => void handleBoardHostApply()}
                    className="text-[11px] px-3 py-2 rounded-lg font-semibold bg-amber-500 text-stone-950 disabled:opacity-50 shrink-0"
                  >
                    {boardBusy ? "…" : locale === "ko" ? "적용" : "Apply"}
                  </button>
                </div>
                <p className="text-[9px] text-[var(--muted)] leading-relaxed">
                  {boardHostHint}
                </p>
                {deviceHr.error && !boardLive && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-400 font-mono break-words">
                    {deviceHr.error}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-2 min-w-0">
                  <div className="text-[9px] text-[var(--muted)] leading-none">{t("oneDay")}</div>
                  <div className="mt-1 text-xs sm:text-sm font-mono font-bold break-all leading-snug">
                    {liveTick
                      ? liveTick.display.pDay >= 0.0001
                        ? `${(liveTick.display.pDay * 100).toFixed(6)}%`
                        : liveTick.display.pDay.toExponential(3)
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2.5 py-2 min-w-0">
                  <div className="text-[9px] text-[var(--muted)] leading-none">
                    {t("expectedTime")}
                  </div>
                  <div className="mt-1 text-xs sm:text-sm font-mono font-bold text-orange-400 break-all leading-snug">
                    {liveTick
                      ? liveTick.odds.expectedSeconds >= 365.25 * 86400
                        ? `${(liveTick.odds.expectedSeconds / (365.25 * 86400)).toFixed(0)}y`
                        : liveTick.odds.expectedSeconds >= 86400
                          ? `${(liveTick.odds.expectedSeconds / 86400).toFixed(0)}d`
                          : `${(liveTick.odds.expectedSeconds / 3600).toFixed(0)}h`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Pool controls: full-width strip on mobile, side card on desktop */}
            <div className="sm:text-right sm:shrink-0 sm:w-[10.5rem] rounded-xl sm:rounded-none border border-[var(--border)] sm:border-0 bg-[var(--bg)] sm:bg-transparent p-2.5 sm:p-0 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                Pool
              </div>
              <select
                className="w-full text-[11px] font-mono rounded-lg border border-[var(--border)] bg-[var(--card)] sm:bg-[var(--bg)] px-2 py-2 sm:py-1 text-[var(--fg)]"
                value={getStoredPool()}
                onChange={(e) => {
                  setStoredPool(e.target.value);
                  void dash.refresh();
                }}
              >
                {POOL_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 flex sm:flex-col flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono">
                <span className="text-amber-500/90 break-all">{dash.pool}</span>
                {dash.lastUpdated != null && (
                  <span className="text-[var(--muted)]">
                    Δ{Math.max(0, Math.floor((nowTick - dash.lastUpdated) / 1000))}s
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard
            label={t("workers")}
            value={String(Number(u.workers) || 0)}
            live={!!u.lastshare && nowTick / 1000 - u.lastshare < 120}
          />
          <StatCard
            label={t("authorised")}
            value={u.authorised ? formatTimeAgo(u.authorised) : "—"}
            sub={u.authorised ? formatUnix(u.authorised) : undefined}
          />
          <StatCard
            label={t("lastShare")}
            value={u.lastshare ? formatTimeAgo(u.lastshare) : "—"}
            sub={u.lastshare ? formatUnix(u.lastshare) : undefined}
            accent={
              u.lastshare && nowTick / 1000 - u.lastshare < 120 ? "green" : "default"
            }
            live={!!u.lastshare && nowTick / 1000 - u.lastshare < 120}
          />
          <StatCard
            label={t("totalShares")}
            value={Number(u.shares || 0).toLocaleString()}
          />
          <StatCard
            label={t("bestShare")}
            value={formatDifficulty(Number(u.bestshare || bestForLadder || 0))}
            accent="amber"
          />
          <StatCard
            label={t("bestEver")}
            value={formatDifficulty(Number(u.bestever || 0))}
            accent="pulse"
          />
        </div>

        {/* Network (merged into first screen) */}
        {net && <NetworkBar network={net} />}
        {net && (
          <BestShareBar
            bestShare={Number(u.bestshare || bestForLadder || 0)}
            bestEver={Number(u.bestever || 0)}
            networkDifficulty={net.difficulty || difficulty}
          />
        )}
        {u.worker && u.worker.length > 0 && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold mb-2">{t("workers")}</h2>
            <div className="space-y-2">
              {u.worker.map((w, idx) => (
                <div
                  key={`${w.workername}-${idx}`}
                  className="rounded-xl bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 min-w-0"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono truncate max-w-[200px] sm:max-w-md">
                      {w.workername.includes(".")
                        ? w.workername.split(".").slice(1).join(".") ||
                          w.workername
                        : w.workername || "default"}
                    </div>
                    <div className="text-[10px] text-[var(--fg)]0 mt-0.5">
                      last {w.lastshare ? formatTimeAgo(w.lastshare) : "—"}
                    </div>
                  </div>
                  <div className="text-right min-w-0">
                    <div className="text-sm font-mono font-semibold text-amber-500 break-all">
                      {w.hashrate5m || w.hashrate1m || "—"}
                    </div>
                    <div className="text-[10px] text-[var(--fg)]0 font-mono">
                      best {formatDifficulty(Number(w.bestshare || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
          </div>
        )}

        {/* ===== TAB: engine ===== */}
        {tab === "engine" && (
          <>
            {difficulty > 0 && (
              <SourceEngineLive
                hashrateHs={engineHs > 0 ? engineHs : 0}
                networkDiff={difficulty}
                bestShare={bestForLadder || bestShare}
                live={miningLive}
                pDay={liveTick?.display.pDay || 0}
                confidence={
                  hrSource === "device" ? 0.95 : miningLive ? 0.9 : 0.15
                }
                agentStatus={
                  hrSource === "device"
                    ? "BOARD_STREAMING"
                    : miningLive
                      ? "POOL_STREAMING"
                      : "NO_CONTACT"
                }
                enhanced={engineEnhanced}
              />
            )}
            {!miningLive && (
              <div className="text-[11px] leading-relaxed text-amber-100 bg-amber-950/50 border border-amber-700/50 rounded-xl px-3 py-2.5">
                {locale === "ko"
                  ? "⚠ 채굴 신호 없음 — 지갑 주소와 풀을 확인하세요. 모바일 데이터에서도 동일."
                  : "⚠ No mining signal — check wallet + pool. Same on mobile data."}
              </div>
            )}
            {miningLive && (
              <div className="text-[11px] leading-relaxed text-emerald-100 bg-emerald-950/40 border border-emerald-700/40 rounded-xl px-3 py-2.5">
                {locale === "ko"
                  ? hrSource === "device"
                    ? "✓ 보드 실측 해시 · 소스엔진 가동 (터널/에이전트)"
                    : "✓ 풀 1분 해시 기준 채굴 모니터링 · 어디서나 (모바일 데이터 OK)"
                  : hrSource === "device"
                    ? "✓ Board hashrate · source engine (tunnel/agent)"
                    : "✓ Pool 1m hashrate monitor · any network (mobile data OK)"}
              </div>
            )}
            {difficulty > 0 && (
              <SourceEngineHub
                tick={liveTick}
                hashrateBase={engineHs > 0 ? engineHs : 0}
                bestShare={bestForLadder || bestShare}
                networkDiff={difficulty}
                networkHashrateHs={Number(net?.hashrate) || 0}
                lastShare={u.lastshare || 0}
                authorised={u.authorised || 0}
                shares={Number(u.shares || 0)}
                workers={Number(u.workers || 0)}
                pool={dash.pool}
                foundBlocks={0}
                deviceOnline={miningLive}
                hasDevice={miningLive}
              />
            )}
          </>
        )}

        {/* ===== TAB: odds ===== */}
        {tab === "odds" && (
          <>
            <LiveOddsPanel tick={liveTick} />
            <SoloCasePanel
              tick={liveTick}
              hashrateBase={engineHs > 0 ? engineHs : shownHs}
              bestShare={bestForLadder || bestShare}
              networkDiff={difficulty}
            />
          </>
        )}

        {/* ===== TAB: chart ===== */}
        {tab === "chart" && (
          <div className="space-y-3">
            <HashrateChart samples={chartSamples} />
            <BtcHourlyChart />
            <DifficultyChart />
            <MempoolBlocks />
          </div>
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} locale={locale} />

      {dash.celebration && (
        <Celebration
          open={celebrateOpen}
          height={dash.celebration.height}
          valueSats={dash.celebration.valueSats}
          onClose={() => setCelebrateOpen(false)}
        />
      )}
    </div>
  );
}
