"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMinerDashboard } from "@/hooks/useMinerDashboard";
import {
  formatHashrateGhs,
  formatDifficulty,
  formatTimeAgo,
  formatUnix,
  toGHs,
} from "@/lib/mining";
import { selectStableHashrate, pickDisplayHashrate } from "@/lib/hashrate";
import {
  clearStoredAddress,
  pushSample,
  loadHistory,
  getStoredDeviceIp,
  getStoredPool,
  setStoredPool,
  rememberLastAddress,
} from "@/lib/history";
import { POOL_OPTIONS } from "@/lib/pools";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { useDeviceHashrate } from "@/hooks/useDeviceHashrate";
import { useAgentTelemetry } from "@/hooks/useAgentTelemetry";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n, localeButtonLabel, localeExitLabel } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import {
  notify,
  notifyBlockFound,
  notifyTempHot,
  shouldNotifyTempHot,
  TEMP_HOT_C,
  TEMP_CLEAR_C,
  wasBlockCelebrated,
  markBlockCelebrated,
  notificationsEnabled,
} from "@/lib/notify";
import { StatCard } from "./StatCard";
import { LiveOddsPanel } from "./LiveOddsPanel";
import { SoloCasePanel } from "./SoloCasePanel";
import { SourceEngineHub } from "./SourceEngineHub";
import { SourceEngineLive } from "./SourceEngineLive";
import { AnalogGauge } from "./AnalogGauge";
import { BestShareBar } from "./BestShareBar";
import { HashrateChart } from "./HashrateChart";
import { NetworkBar } from "./NetworkBar";
import { MempoolBlocks } from "./MempoolBlocks";
import { Celebration } from "./Celebration";
import { ConnectionLight } from "./ConnectionLight";
import { NotifyBell } from "./NotifyBell";
import { BtcDisclaimer } from "./BtcDisclaimer";
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
  const deviceHr = useDeviceHashrate(true);
  /** Multi-tenant: clientId = payout address. Bridge must use same CLIENT_ID. */
  const agent = useAgentTelemetry(true, address);
  const [tab, setTab] = useState<DashTab>("cluster");
  const [celebrateOpen, setCelebrateOpen] = useState(true);
  const [localHistory, setLocalHistory] = useState(() => loadHistory(address));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const prevFound = useRef<number | null>(null);

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

  // STRICT: Agent telemetry (preferred) then legacy proxy/tunnel.
  const deviceHsLive = (() => {
    if (agent.hasLiveHashrate && agent.hashRateHs > 0) return agent.hashRateHs;
    const d = deviceHr.device;
    if (!d || !d.online) return 0;
    const ghs = Number(d.hashRateGhs);
    if (Number.isFinite(ghs) && ghs > 0) return ghs * 1e9;
    const hs = Number(d.hashRateHs);
    return Number.isFinite(hs) && hs > 0 ? hs : 0;
  })();

  const picked = pickDisplayHashrate({
    deviceOnline:
      agent.hasLiveHashrate ||
      deviceHsLive > 0 ||
      !!(deviceHr.device?.online && deviceHr.hasLiveHashrate),
    deviceHs: deviceHsLive,
    poolStableHs: poolHr.displayHs || poolHr.instantHs || poolHr.stableHs,
  });
  const shownHs = picked.hs;
  const hrSource =
    agent.hasLiveHashrate
      ? "device"
      : picked.source === "none"
        ? "pool"
        : picked.source;
  const deviceAgeMs = agent.collectedAt
    ? Math.max(0, nowTick - agent.collectedAt)
    : deviceHr.device?.fetchedAt != null
      ? Math.max(0, nowTick - deviceHr.device.fetchedAt)
      : null;
  const deviceIsSticky =
    hrSource === "device" &&
    !agent.hasLiveHashrate &&
    deviceHr.device != null &&
    deviceHr.device.live === false;

  const heartbeatOk =
    dash.loading && !dash.user
      ? null
      : deviceHsLive > 0
        ? true
        : dash.error && !dash.user
          ? false
          : !dash.error || !!dash.user;
  const { status } = useOnlineStatus(heartbeatOk);

  const bestForLadder = Math.max(
    Number(dash.user?.bestshare || 0),
    Number(deviceHr.device?.bestSessionDiff || 0)
  );
  const bestShare = Math.max(bestForLadder, Number(dash.user?.bestever || 0));
  const difficulty =
    Number(dash.network?.difficulty) ||
    Number(deviceHr.device?.networkDifficulty || 0) ||
    0;

  const liveTick = useLiveOdds({
    hashrateBase: shownHs,
    difficulty,
    bestShare: bestForLadder || bestShare,
    active: shownHs > 0 && difficulty > 0,
  });

  // Reset chart when address changes
  useEffect(() => {
    setLocalHistory(loadHistory(address));
    prevFound.current = null;
  }, [address]);

  useEffect(() => {
    if (dash.celebration) setCelebrateOpen(true);
  }, [dash.celebration]);

  // Force-sync device IP from storage (first paint / AddressGate race)
  useEffect(() => {
    const ip = getStoredDeviceIp();
    if (ip && ip !== deviceHr.ip) deviceHr.setIp(ip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart samples from active display source (device-first, 1s)
  useEffect(() => {
    if (shownHs > 0 && hrSource === "device") {
      setLocalHistory((prev) => pushSample(address, toGHs(shownHs), prev));
    }
  }, [address, shownHs, hrSource, deviceHr.device?.fetchedAt]);

  // Pool chart only when device unavailable — use live 1m display
  useEffect(() => {
    if (hrSource === "device") return;
    const poolHs = poolHr.displayHs || poolHr.instantHs || poolHr.stableHs;
    if (poolHs <= 0) return;
    setLocalHistory((prev) => pushSample(address, toGHs(poolHs), prev));
  }, [
    address,
    hrSource,
    poolHr.displayHs,
    poolHr.instantHs,
    poolHr.stableHs,
    dash.lastUpdated,
  ]);

  // foundBlocks: only on INCREASE (not historical total on first load)
  useEffect(() => {
    if (!deviceHr.device?.online) return;
    const total = Number(deviceHr.device.totalFoundBlocks || deviceHr.device.foundBlocks || 0);
    if (prevFound.current === null) {
      prevFound.current = total;
      return;
    }
    if (total > prevFound.current) {
      const id = `device-blocks-${address}-${total}`;
      if (!wasBlockCelebrated(id)) {
        markBlockCelebrated(id);
        setCelebrateOpen(true);
        notifyBlockFound(null, 0);
        notify("🎉 BLOCK FOUND (device)", `totalFoundBlocks=${total}`, id);
      }
      prevFound.current = total;
    }
  }, [
    address,
    deviceHr.device?.online,
    deviceHr.device?.foundBlocks,
    deviceHr.device?.totalFoundBlocks,
  ]);

  // Temp ≥ 61°C → system notification (re-arms below 55°C)
  useEffect(() => {
    if (!deviceHr.device?.online) return;
    const t = Number(deviceHr.device.temp);
    if (!Number.isFinite(t)) return;
    if (shouldNotifyTempHot(t)) {
      notifyTempHot(t, deviceHr.device.deviceModel);
    }
  }, [
    deviceHr.device?.online,
    deviceHr.device?.temp,
    deviceHr.device?.deviceModel,
    deviceHr.device?.fetchedAt,
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
      deviceHr.hasDevice ? deviceHr.refresh() : Promise.resolve(),
    ]);
  }

  /**
   * Pool-first product:
   * - "ok" = home Device Link streaming
   * - "idle" = optional off (NOT a hard failure — pool UI still full product)
   * - "loading" = bridge seen but no hashrate yet
   */
  const deviceLinkStatus: "idle" | "loading" | "ok" | "optional" = (() => {
    if (agent.hasLiveHashrate) return "ok";
    if (agent.deviceOnline) return "ok";
    if (agent.agentOnline && agent.telemetry && Number(agent.hashRateGhs) > 0)
      return "ok";
    if (agent.staleMs < 45_000 && agent.telemetry) return "ok";
    if (agent.agentOnline) return "loading";
    return "optional";
  })();

  const deviceTemp =
    agent.tempC != null && Number.isFinite(agent.tempC)
      ? agent.tempC
      : deviceHr.device?.temp != null && Number.isFinite(Number(deviceHr.device.temp))
        ? Number(deviceHr.device.temp)
        : null;
  const tempHot = deviceTemp != null && deviceTemp >= TEMP_HOT_C;
  const tempWarn =
    deviceTemp != null && deviceTemp >= TEMP_CLEAR_C && deviceTemp < TEMP_HOT_C;

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
  const modelLabel =
    deviceHr.device?.online && deviceHr.device.deviceModel
      ? deviceHr.device.deviceModel
      : "Solo miner";

  const toolBtn =
    "inline-flex items-center justify-center h-8 px-2.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--muted)] shrink-0 leading-none";

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] bg-[var(--bg)] text-[var(--fg)] overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-stone-800 bg-stone-950/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-3 py-2 space-y-2">
          {/* Row 1: brand + status */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-700 via-amber-500 to-stone-800 flex items-center justify-center text-sm shrink-0 border border-amber-600/40">
              ◎
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="text-sm font-bold leading-tight shrink-0 tracking-tight">
                  Solo<span className="text-amber-500">Pulse</span>{" "}
                  <span className="text-[9px] font-normal text-stone-500 tracking-[0.2em] uppercase">
                    Intelligence
                  </span>
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
            <a href="/hub" className={`${toolBtn} border-emerald-500/40 text-emerald-400`}>
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

      <main className="max-w-3xl mx-auto px-3 pt-3 space-y-3 w-full min-w-0">
        {dash.error && (
          <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 break-words">
            {dash.error}
          </div>
        )}

        {/* ===== TAB: cluster ===== */}
        {tab === "cluster" && (
          <>
        {/* Analog instrument cluster */}
        <section className="rounded-2xl border border-stone-700/90 bg-gradient-to-b from-stone-900/95 to-stone-950 p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-600 font-semibold">
              SoloPulse Intelligence · INSTRUMENT CLUSTER
            </div>
            <div
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                agent.agentOnline
                  ? "border-emerald-600/50 text-emerald-400"
                  : "border-red-800/60 text-red-400"
              }`}
            >
              AGENT {agent.agentStatus}
            </div>
          </div>
          <div className="flex flex-wrap justify-around gap-2 sm:gap-4">
            <AnalogGauge
              value={shownHs > 0 ? shownHs / 1e9 : 0}
              min={0}
              max={Math.max(6000, (shownHs / 1e9) * 1.25 || 5000)}
              label="HASHRATE"
              unit="GH/s"
            />
            <AnalogGauge
              value={deviceTemp ?? 0}
              min={20}
              max={90}
              label="TEMP"
              unit="°C"
              warnAt={55}
              dangerAt={TEMP_HOT_C}
            />
            <AnalogGauge
              value={
                agent.powerW ??
                (deviceHr.device?.power != null ? Number(deviceHr.device.power) : 0)
              }
              min={0}
              max={150}
              label="POWER"
              unit="W"
            />
          </div>
          <div className="mt-2 text-center font-mono text-2xl sm:text-3xl text-stone-50 tabular-nums tracking-tight">
            {shownHs > 0 ? formatHashrateGhs(shownHs, 2) : "—"}
            <span className="text-sm text-amber-500 ml-2">
              {hrSource === "device"
                ? agent.hasLiveHashrate
                  ? "AGENT"
                  : "DEVICE"
                : "POOL"}
            </span>
          </div>
          <div className="text-center text-[10px] font-mono text-stone-500 mt-1 break-all">
            {agent.hasLiveHashrate
              ? `${agent.deviceModel || "miner"} · ${agent.hostIp || "—"} · age ${
                  deviceAgeMs != null ? `${(deviceAgeMs / 1000).toFixed(0)}s` : "—"
                }`
              : hrSource === "device" && deviceHr.device
                ? `${deviceHr.device.deviceModel} · ${deviceHr.ip || ""}`
                : `pool 1m ${u.hashrate1m || "—"} · 5m ${u.hashrate5m || "—"}`}
          </div>
        </section>

        {/* Pool-first: device link is optional enhancement, not a broken site */}
        {deviceLinkStatus === "optional" && (
          <div className="text-[11px] leading-relaxed text-stone-200 bg-stone-900/80 border border-stone-700 rounded-xl px-3 py-2.5 space-y-1.5">
            <div className="font-semibold text-emerald-400/95">
              {locale === "ko"
                ? "풀 모드로 정상 작동 중 (설치 불필요)"
                : "Running in pool mode (no install needed)"}
            </div>
            <div className="text-[10px] text-stone-400">
              {locale === "ko"
                ? "웹만으로 해시·확률·차트를 볼 수 있습니다. 집 보드 실시간(온도 등)이 필요하면 Device Link를 선택 설치하세요 — 실패가 아닙니다."
                : "Pool hashrate, odds, and charts work from the link alone. Optional Device Link adds live board stats — not an error."}
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setTab("agent")}
                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-600/90 text-stone-950 font-semibold"
              >
                {locale === "ko" ? "기기 실시간 연결 (선택)" : "Optional device link"}
              </button>
              <a
                href={`/bridge?address=${encodeURIComponent(address)}`}
                className="text-[10px] px-2.5 py-1.5 rounded-lg border border-stone-600 text-stone-300"
              >
                {locale === "ko" ? "다운로드 페이지" : "Download page"}
              </a>
            </div>
          </div>
        )}

        {/* ① Hashrate detail + legacy controls */}
        <section className="rounded-2xl border border-stone-700/80 bg-stone-950/80 p-3 sm:p-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-stone-500">
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {hrSource === "device"
                    ? agent.hasLiveHashrate
                      ? locale === "ko"
                        ? "Local Agent 실측"
                        : "Local Agent live"
                      : deviceIsSticky
                        ? locale === "ko"
                          ? "기기 (최근값 유지)"
                          : "Device (sticky)"
                        : t("deviceLive")
                    : t("poolOnly")}
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        hrSource === "device" && !deviceIsSticky
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        hrSource === "device" && !deviceIsSticky
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                    />
                  </span>
                </span>
              </div>

              <div className="text-[10px] font-mono text-stone-400 leading-relaxed break-all">
                {hrSource === "device" && (agent.hasLiveHashrate || deviceHr.device) ? (
                  <>
                    <span className="text-emerald-500">
                      {agent.hasLiveHashrate ? "AGENT" : "DEVICE"}
                    </span>{" "}
                    {(agent.hashRateGhs || deviceHr.device?.hashRateGhs || 0).toFixed(2)} GH/s
                    {deviceTemp != null && ` · ${deviceTemp.toFixed(1)}°C`}
                    {(agent.powerW ?? deviceHr.device?.power) != null &&
                      ` · ${Number(agent.powerW ?? deviceHr.device?.power).toFixed(1)}W`}
                  </>
                ) : (
                  <>
                    <span className="text-amber-500">POOL</span> 1m {u.hashrate1m || "—"} · 5m{" "}
                    {u.hashrate5m || "—"} · 1h {u.hashrate1hr || "—"}
                  </>
                )}
              </div>

              {!agent.agentOnline && hrSource !== "device" && (
                <div className="text-[10px] text-stone-400 border border-stone-700 rounded-lg px-2 py-1.5">
                  {locale === "ko"
                    ? "풀 데이터는 정상입니다. 보드 실측은 Local Agent가 필요합니다."
                    : "Pool data is live. Board live needs Local Agent."}
                </div>
              )}

              {/* Live board temperature (1s device poll) */}
              {deviceHr.hasLiveHashrate && (
                <div
                  className={`flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${
                    tempHot
                      ? "border-red-500/50 bg-red-500/15"
                      : tempWarn
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-[var(--border)] bg-[var(--bg)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                      {locale === "ko" ? "기기 온도" : "Board temp"} · 1s
                    </div>
                    <div
                      className={`text-lg sm:text-xl font-mono font-bold tabular-nums leading-none mt-0.5 ${
                        tempHot
                          ? "text-red-400"
                          : tempWarn
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {deviceTemp != null ? `${deviceTemp.toFixed(1)}°C` : "—"}
                    </div>
                  </div>
                  {deviceHr.device?.power != null &&
                    Number.isFinite(deviceHr.device.power) && (
                      <div className="text-right shrink-0">
                        <div className="text-[9px] text-[var(--muted)] uppercase">
                          Power
                        </div>
                        <div className="text-sm font-mono font-semibold text-[var(--fg)]">
                          {deviceHr.device.power.toFixed(1)}W
                        </div>
                      </div>
                    )}
                  <div
                    className={`text-[10px] font-medium px-2 py-1 rounded-lg shrink-0 ${
                      tempHot
                        ? "bg-red-500/25 text-red-300"
                        : tempWarn
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {tempHot
                      ? locale === "ko"
                        ? `과열 ≥${TEMP_HOT_C}°C`
                        : `HOT ≥${TEMP_HOT_C}°C`
                      : tempWarn
                        ? locale === "ko"
                          ? "주의"
                          : "Warm"
                        : locale === "ko"
                          ? "정상"
                          : "OK"}
                  </div>
                </div>
              )}

              {tempHot && (
                <div className="text-[11px] leading-relaxed text-red-200 bg-red-600/20 border border-red-500/40 rounded-lg px-2.5 py-2 break-words">
                  {locale === "ko"
                    ? `🔥 보드 ${deviceTemp!.toFixed(1)}°C — ${TEMP_HOT_C}°C 이상입니다. 냉각·통풍을 확인하세요.`
                    : `🔥 Board ${deviceTemp!.toFixed(1)}°C — over ${TEMP_HOT_C}°C. Check cooling.`}
                  {!notificationsEnabled() && (
                    <span className="block mt-1 text-[10px] text-red-200/80">
                      {locale === "ko"
                        ? "시스템 알림은 헤더 🔔 알림을 켜면 받습니다."
                        : "Enable 🔔 in the header for system alerts."}
                    </span>
                  )}
                </div>
              )}

              <div className="text-[9px] font-mono text-[var(--muted)] leading-relaxed break-all">
                ckpool: 1m {u.hashrate1m || "—"} / 5m {u.hashrate5m || "—"} / 1h{" "}
                {u.hashrate1hr || "—"} / 1d {u.hashrate1d || "—"}
              </div>

              {/* Device path = Local Agent only (no cloud→LAN) */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setTab("agent")}
                  className={`text-[11px] px-3 py-2 rounded-lg font-medium border transition-colors ${
                    agent.hasLiveHashrate
                      ? "bg-emerald-600/20 text-emerald-300 border-emerald-600/40"
                      : "bg-amber-600/90 text-stone-950 border-amber-500"
                  }`}
                >
                  {agent.hasLiveHashrate
                    ? locale === "ko"
                      ? "📡 기기 연결됨"
                      : "📡 Device live"
                    : locale === "ko"
                      ? "📡 기기 연결 (선택)"
                      : "📡 Device link (optional)"}
                </button>
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <button
                    type="button"
                    className="text-[11px] px-3 py-2 rounded-lg font-medium border border-stone-700 text-stone-300"
                    onClick={() => void agent.refresh()}
                  >
                    {locale === "ko" ? "상태 새로고침" : "Refresh"}
                  </button>
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${
                      deviceLinkStatus === "ok"
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : deviceLinkStatus === "loading"
                          ? "border-amber-500/50 bg-amber-500/10"
                          : "border-stone-700 bg-stone-900"
                    }`}
                    title={
                      deviceLinkStatus === "ok"
                        ? "Device Link STREAMING"
                        : deviceLinkStatus === "loading"
                          ? "Device Link connecting"
                          : "Pool mode (device optional)"
                    }
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      {deviceLinkStatus === "ok" && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                          deviceLinkStatus === "ok"
                            ? "bg-emerald-500"
                            : deviceLinkStatus === "loading"
                              ? "bg-amber-500"
                              : "bg-zinc-600"
                        }`}
                      />
                    </span>
                  </span>
                </div>
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
                <span className="text-[var(--muted)] break-all">{modelLabel}</span>
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
            value={String(
              Math.max(
                Number(u.workers) || 0,
                agent.hasLiveHashrate || deviceHr.device?.online ? 1 : 0
              )
            )}
            live={hrSource === "device" || (!!u.lastshare && nowTick / 1000 - u.lastshare < 120)}
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
            value={Number(
              agent.sharesAccepted ||
                deviceHr.device?.sharesAccepted ||
                u.shares ||
                0
            ).toLocaleString()}
            sub={
              (agent.sharesRejected || deviceHr.device?.sharesRejected)
                ? `rej ${agent.sharesRejected || deviceHr.device?.sharesRejected}`
                : undefined
            }
          />
          <StatCard
            label={t("bestShare")}
            value={formatDifficulty(
              Math.max(
                Number(u.bestshare || 0),
                Number(agent.bestSessionDiff || 0),
                Number(deviceHr.device?.bestSessionDiff || 0),
                bestForLadder || 0
              )
            )}
            accent="amber"
          />
          <StatCard
            label={t("bestEver")}
            value={formatDifficulty(
              Math.max(
                Number(u.bestever || 0),
                Number(agent.bestDiff || 0),
                Number(deviceHr.device?.bestDiff || 0)
              )
            )}
            accent="pulse"
          />
        </div>
          </>
        )}

        {/* ===== TAB: engine ===== */}
        {tab === "engine" && (
          <>
            {difficulty > 0 && (
              <SourceEngineLive
                hashrateHs={shownHs}
                networkDiff={difficulty}
                bestShare={bestForLadder || bestShare}
                live={hrSource === "device" && !deviceIsSticky}
                pDay={liveTick?.display.pDay || 0}
                confidence={
                  agent.hasLiveHashrate ? 0.85 : hrSource === "device" ? 0.55 : 0.35
                }
                agentStatus={agent.agentStatus}
              />
            )}
            {difficulty > 0 && (
              <SourceEngineHub
                tick={liveTick}
                hashrateBase={shownHs}
                bestShare={bestForLadder || bestShare}
                networkDiff={difficulty}
                networkHashrateHs={Number(net?.hashrate) || 0}
                lastShare={u.lastshare || 0}
                authorised={u.authorised || 0}
                shares={Number(
                  agent.sharesAccepted ||
                    deviceHr.device?.sharesAccepted ||
                    u.shares ||
                    0
                )}
                workers={Number(u.workers || 0)}
                pool={dash.pool}
                foundBlocks={
                  agent.foundBlocks || deviceHr.device?.foundBlocks || 0
                }
                deviceOnline={agent.hasLiveHashrate || !!deviceHr.device?.online}
                hasDevice={agent.agentOnline || deviceHr.hasDevice}
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
              hashrateBase={shownHs}
              bestShare={bestForLadder || bestShare}
              networkDiff={difficulty}
            />
          </>
        )}

        {/* ===== TAB: chart ===== */}
        {tab === "chart" && <HashrateChart samples={chartSamples} />}

        {/* ===== TAB: network ===== */}
        {tab === "network" && (
          <>
            {net && <NetworkBar network={net} />}
            <MempoolBlocks />
            {net && (
              <BestShareBar
                bestShare={Number(u.bestshare || bestForLadder || 0)}
                bestEver={Number(u.bestever || 0)}
                networkDifficulty={net.difficulty || difficulty}
              />
            )}
            {u.worker && u.worker.length > 0 && (
              <section className="rounded-2xl border border-stone-700 bg-stone-950 p-4">
                <h2 className="text-sm font-semibold mb-2">{t("workers")}</h2>
                <div className="space-y-2">
                  {u.worker.map((w, idx) => (
                    <div
                      key={`${w.workername}-${idx}`}
                      className="rounded-xl bg-stone-900 border border-stone-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono truncate max-w-[200px] sm:max-w-md">
                          {w.workername.includes(".")
                            ? w.workername.split(".").slice(1).join(".") ||
                              w.workername
                            : w.workername || "default"}
                        </div>
                        <div className="text-[10px] text-stone-500 mt-0.5">
                          last {w.lastshare ? formatTimeAgo(w.lastshare) : "—"}
                        </div>
                      </div>
                      <div className="text-right min-w-0">
                        <div className="text-sm font-mono font-semibold text-amber-500 break-all">
                          {w.hashrate5m || w.hashrate1m || "—"}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          best {formatDifficulty(Number(w.bestshare || 0))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ===== TAB: agent ===== */}
        {tab === "agent" && (
          <section className="rounded-2xl border border-stone-700 bg-gradient-to-b from-stone-900 to-stone-950 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-600 font-semibold">
              PRODUCT · WEB + OPTIONAL DEVICE LINK
            </div>
            <h2 className="text-lg font-bold text-stone-100">
              {locale === "ko"
                ? "웹은 완전체 · 기기는 선택 연결"
                : "Web is complete · device is optional"}
            </h2>
            <div
              className={`text-sm font-mono px-3 py-2 rounded-lg border ${
                agent.hasLiveHashrate
                  ? "border-emerald-600/50 bg-emerald-950/40 text-emerald-300"
                  : "border-stone-600 bg-stone-900/80 text-stone-300"
              }`}
            >
              {agent.hasLiveHashrate
                ? `STREAMING · ${agent.hashRateGhs.toFixed(1)} GH/s · ${agent.hostIp || "—"} · ${agent.tempC ?? "—"}°C`
                : locale === "ko"
                  ? `풀 모드 · 기기 링크 없음 (정상) · id ${address.slice(0, 12)}…`
                  : `Pool mode · no device link (OK) · id ${address.slice(0, 12)}…`}
            </div>

            <div className="text-[11px] text-stone-400 leading-relaxed space-y-2">
              <p className="font-semibold text-emerald-400/90">
                {locale === "ko"
                  ? "제3자 · 링크만 타는 사용자"
                  : "Third parties · link only"}
              </p>
              <p>
                {locale === "ko"
                  ? "설치 없이 주소만 입력하면 풀 통계·확률·차트가 동작합니다. 당신 bat 파일이 필요하지 않습니다."
                  : "No install: enter payout address for pool stats, odds, charts. They never need your desktop .bat."}
              </p>
              <p className="font-semibold text-amber-400/90 pt-1">
                {locale === "ko"
                  ? "자기 집 보드 실시간 (선택)"
                  : "Live home board (optional)"}
              </p>
              <p>
                {locale === "ko"
                  ? "브라우저/클라우드가 집 안 IP로 직접 들어갈 수 없어, 사이트에서 받은 Device Link를 자기 PC에서 실행합니다. CLIENT_ID = 로그인 주소라 사용자끼리 데이터가 안 섞입니다."
                  : "Cloud/browser cannot reach private miner IPs. Download Device Link from the site; CLIENT_ID = your address so users never mix data."}
              </p>
              <pre className="text-[10px] font-mono bg-black/50 border border-stone-700 rounded-lg p-2.5 overflow-x-auto text-stone-300 whitespace-pre-wrap">{`[누구나 폰/PC] ─링크─▶ [SoloPulse 웹 = 풀 완전체]
                              ▲ 선택
               [자기 집 PC Device Link] ─▶ [자기 마이너]`}</pre>
            </div>

            <a
              href={`/api/bridge/bundle?clientId=${encodeURIComponent(address)}&format=bat`}
              className="block w-full text-center rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3"
            >
              {locale === "ko"
                ? "내 주소로 설정된 Bridge .bat 받기"
                : "Download Bridge .bat for my address"}
            </a>
            <a
              href={`/bridge?address=${encodeURIComponent(address)}`}
              className="block w-full text-center rounded-xl border border-stone-600 text-stone-200 text-sm py-2.5"
            >
              {locale === "ko" ? "설치 가이드 / 제3자 안내" : "Install guide / for sharing"}
            </a>
            <button
              type="button"
              onClick={() => void agent.refresh()}
              className="w-full rounded-xl border border-stone-700 text-stone-300 text-sm py-2.5"
            >
              {locale === "ko" ? "상태 새로고침" : "Refresh status"}
            </button>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <a
                href="https://x.com/medbedeee"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-stone-700 px-4 py-2 text-xs text-stone-400"
              >
                𝕏 {t("feedback")}
              </a>
              <LightningTip variant="pill" />
            </div>
            <p className="text-center text-[10px] text-stone-600">
              <BtcDisclaimer className="align-middle" />
            </p>
          </section>
        )}
      </main>

      <BottomNav
        tab={tab}
        onChange={setTab}
        locale={locale}
        agentLive={agent.hasLiveHashrate}
      />

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
