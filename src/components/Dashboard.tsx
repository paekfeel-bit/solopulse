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
import { BtcHourlyChart } from "./BtcHourlyChart";
import { DifficultyChart } from "./DifficultyChart";
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
  /** Device + agent paths restored (IP input / auto-scan on home). */
  const deviceHr = useDeviceHashrate(true);
  const agent = useAgentTelemetry(true, address);
  const [tab, setTab] = useState<DashTab>("home");
  const [celebrateOpen, setCelebrateOpen] = useState(true);
  const [localHistory, setLocalHistory] = useState(() => loadHistory(address));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [deviceIpDraft, setDeviceIpDraft] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() || "auto" : "auto"
  );
  const [deviceBusy, setDeviceBusy] = useState(false);
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

  // Connection light = pool/API health only (never requires bridge)
  const heartbeatOk =
    dash.loading && !dash.user
      ? null
      : dash.error && !dash.user
        ? false
        : !dash.error || !!dash.user || shownHs > 0 || poolHr.displayHs > 0;
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
    const ip = getStoredDeviceIp() || "auto";
    setDeviceIpDraft(ip);
    if (ip !== deviceHr.ip) deviceHr.setIp(ip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeviceConnect() {
    setDeviceBusy(true);
    try {
      const raw = deviceIpDraft.trim() || "auto";
      const info = await deviceHr.connect(raw);
      if (info?.ip) setDeviceIpDraft(String(info.ip));
      else setDeviceIpDraft(raw);
    } finally {
      setDeviceBusy(false);
    }
  }

  async function handleDeviceScan() {
    setDeviceBusy(true);
    try {
      setDeviceIpDraft("auto");
      const found = await deviceHr.scanLan();
      if (found?.[0]?.ip) setDeviceIpDraft(found[0].ip);
      else setDeviceIpDraft("auto");
    } finally {
      setDeviceBusy(false);
    }
  }

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

        {/* ===== TAB: home (gauges + network) — first screen ===== */}
        {tab === "home" && (
          <>
        {/* Analog instrument cluster */}
        <section className="rounded-2xl border border-stone-700/90 bg-gradient-to-b from-stone-900/95 to-stone-950 p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-[0.28em] text-amber-600 font-semibold">
              SoloPulse · HOME · GAUGES + NET
            </div>
            <div
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                shownHs > 0 || !!dash.user
                  ? "border-emerald-600/50 text-emerald-400"
                  : dash.loading
                    ? "border-amber-600/50 text-amber-400"
                    : "border-stone-600 text-stone-400"
              }`}
            >
              {agent.hasLiveHashrate || deviceHr.hasLiveHashrate
                ? locale === "ko"
                  ? "LIVE · 기기"
                  : "LIVE · DEVICE"
                : shownHs > 0 || !!dash.user
                  ? locale === "ko"
                    ? "LIVE · 풀"
                    : "LIVE · POOL"
                  : dash.loading
                    ? "…"
                    : "IDLE"}
            </div>
          </div>
          <div className="flex flex-wrap justify-around gap-2 sm:gap-4">
            <AnalogGauge
              value={shownHs > 0 ? shownHs / 1e9 : 0}
              min={0}
              max={Math.max(6000, (shownHs / 1e9) * 1.25 || 5000)}
              label="HASHRATE"
              unit="GH/s"
              live
              decimals={1}
              sensitiveScale
            />
            <AnalogGauge
              value={deviceTemp != null && Number.isFinite(deviceTemp) ? deviceTemp : 0}
              min={20}
              max={90}
              label="TEMP"
              unit="°C"
              warnAt={55}
              dangerAt={TEMP_HOT_C}
              live={deviceTemp != null}
              decimals={1}
              sensitiveScale
            />
            <AnalogGauge
              value={
                agent.powerW != null && Number.isFinite(agent.powerW)
                  ? agent.powerW
                  : deviceHr.device?.power != null
                    ? Number(deviceHr.device.power)
                    : 0
              }
              min={0}
              max={150}
              label="POWER"
              unit="W"
              live
              decimals={1}
              sensitiveScale
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

        {/* ① Hashrate detail + legacy controls */}
        <section className="rounded-2xl border border-stone-700/80 bg-stone-950/80 p-3 sm:p-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-stone-500">
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {hrSource === "device"
                    ? locale === "ko"
                      ? "보드 실측"
                      : "Board live"
                    : locale === "ko"
                      ? "풀 해시레이트 (링크 전용)"
                      : "Pool hashrate (link only)"}
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

              {/* Live board temperature (only if board path active) */}
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

              {/* Device connect panel — IP + auto search restored */}
              <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-2.5 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                  {locale === "ko" ? "기기 연결 (보드)" : "Device link (board)"}
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5">
                  <input
                    type="text"
                    value={deviceIpDraft}
                    onChange={(e) => setDeviceIpDraft(e.target.value)}
                    placeholder="auto / 172.30.1.33"
                    spellCheck={false}
                    className="flex-1 min-w-0 rounded-lg border border-stone-600 bg-stone-950 px-2.5 py-2 text-xs font-mono text-stone-100"
                  />
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={deviceBusy}
                      onClick={() => void handleDeviceConnect()}
                      className="text-[11px] px-3 py-2 rounded-lg font-semibold bg-amber-600 text-stone-950 disabled:opacity-50"
                    >
                      {deviceBusy
                        ? "…"
                        : locale === "ko"
                          ? "연결"
                          : "Connect"}
                    </button>
                    <button
                      type="button"
                      disabled={deviceBusy}
                      onClick={() => void handleDeviceScan()}
                      className="text-[11px] px-3 py-2 rounded-lg font-medium border border-amber-600/60 text-amber-300 disabled:opacity-50"
                    >
                      {locale === "ko" ? "자동 검색" : "Auto scan"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {["auto", "172.30.1.33", "172.30.1.70", "172.30.1.56"].map((ip) => (
                    <button
                      key={ip}
                      type="button"
                      onClick={() => setDeviceIpDraft(ip)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded border border-stone-700 text-stone-400 hover:text-stone-200"
                    >
                      {ip}
                    </button>
                  ))}
                </div>
                <div
                  className={`text-[10px] font-mono leading-relaxed ${
                    agent.hasLiveHashrate || deviceHr.hasLiveHashrate
                      ? "text-emerald-400"
                      : deviceHr.status === "connecting" || deviceBusy
                        ? "text-amber-400"
                        : "text-stone-400"
                  }`}
                >
                  {agent.hasLiveHashrate
                    ? `STREAMING · agent · ${agent.hostIp || "—"} · ${agent.hashRateGhs.toFixed(1)} GH/s`
                    : deviceHr.hasLiveHashrate
                      ? `ONLINE · device · ${deviceHr.device?.ip || deviceHr.ip} · ${(deviceHr.device?.hashRateGhs || 0).toFixed(1)} GH/s`
                      : deviceHr.error
                        ? `OFFLINE · ${deviceHr.error}`
                        : deviceHr.status === "connecting" || deviceBusy
                          ? locale === "ko"
                            ? "연결/검색 중…"
                            : "Connecting…"
                          : locale === "ko"
                            ? "미연결 · IP 입력 후 연결 또는 자동 검색 · 집 PC에 start-bridge.bat 권장"
                            : "Not linked · enter IP or Auto scan · run start-bridge.bat on home PC"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-stone-700 text-stone-300"
                    onClick={() => void handleRefresh()}
                  >
                    {locale === "ko" ? "전체 새로고침" : "Refresh all"}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-stone-700 text-stone-300"
                    onClick={() => void agent.refresh()}
                  >
                    {locale === "ko" ? "Agent 갱신" : "Refresh agent"}
                  </button>
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

        {/* Network (merged into first screen) */}
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
        {tab === "chart" && (
          <div className="space-y-3">
            <HashrateChart samples={chartSamples} />
            <BtcHourlyChart />
            <DifficultyChart />
          </div>
        )}

        {/* ===== TAB: more (link-only product info) ===== */}
        {tab === "more" && (
          <section className="rounded-2xl border border-stone-700 bg-gradient-to-b from-stone-900 to-stone-950 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-600 font-semibold">
              LINK ONLY · NO INSTALL
            </div>
            <h2 className="text-lg font-bold text-stone-100">
              {locale === "ko"
                ? "링크만으로 모바일·PC 사용"
                : "Mobile & PC from the link alone"}
            </h2>
            <div className="text-sm font-mono px-3 py-2 rounded-lg border border-emerald-600/40 bg-emerald-950/30 text-emerald-300">
              {locale === "ko"
                ? "브리지·앱 다운로드 없음 · 주소 입력만"
                : "No bridge · no app download · just your address"}
            </div>
            <div className="text-[11px] text-stone-400 leading-relaxed space-y-2">
              <p>
                {locale === "ko"
                  ? "공유받은 링크를 폰이나 PC 브라우저에서 열고, 채굴 주소만 넣으면 해시·확률·차트·네트워크가 동작합니다. 제3자는 bat/브리지를 받을 필요가 없습니다."
                  : "Open the shared link in any phone or PC browser, enter your payout address, and hashrate, odds, charts, and network data work. Third parties never download a bridge."}
              </p>
              <p className="text-stone-500">
                {locale === "ko"
                  ? "데이터 출처: 솔로 풀(API) — 인터넷에서 바로 조회. 집 안 마이너 IP는 사용하지 않습니다."
                  : "Data source: solo pool APIs on the public internet. No private home miner IP required."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3"
            >
              {locale === "ko" ? "대시보드 새로고침" : "Refresh dashboard"}
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
