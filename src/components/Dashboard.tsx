"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMinerDashboard } from "@/hooks/useMinerDashboard";
import {
  formatHashrate,
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
  normalizeDeviceHost,
} from "@/lib/history";
import { POOL_OPTIONS } from "@/lib/pools";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { useDeviceHashrate } from "@/hooks/useDeviceHashrate";
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
import { BestShareBar } from "./BestShareBar";
import { HashrateChart } from "./HashrateChart";
import { NetworkBar } from "./NetworkBar";
import { MempoolBlocks } from "./MempoolBlocks";
import { Celebration } from "./Celebration";
import { ConnectionLight } from "./ConnectionLight";
import { NotifyBell } from "./NotifyBell";
import { BtcDisclaimer } from "./BtcDisclaimer";
import { LightningTip } from "./LightningTip";

interface Props {
  address: string;
  onLogout: () => void;
}

export function Dashboard({ address, onLogout }: Props) {
  const { t, cycleLocale, locale } = useI18n();
  const { theme, toggle } = useTheme();
  const dash = useMinerDashboard(address);
  const deviceHr = useDeviceHashrate(true);
  const [celebrateOpen, setCelebrateOpen] = useState(true);
  const [localHistory, setLocalHistory] = useState(() => loadHistory(address));
  const [deviceIpDraft, setDeviceIpDraft] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() : "172.30.1.99"
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [deviceLinking, setDeviceLinking] = useState(false);
  const [deviceScanning, setDeviceScanning] = useState(false);
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

  // STRICT: board is ground truth (live or sticky).
  const deviceHsLive = (() => {
    const d = deviceHr.device;
    if (!d || !d.online) return 0;
    const ghs = Number(d.hashRateGhs);
    if (Number.isFinite(ghs) && ghs > 0) return ghs * 1e9;
    const hs = Number(d.hashRateHs);
    return Number.isFinite(hs) && hs > 0 ? hs : 0;
  })();

  const picked = pickDisplayHashrate({
    deviceOnline: deviceHsLive > 0 || !!(deviceHr.device?.online && deviceHr.hasLiveHashrate),
    deviceHs: deviceHsLive,
    poolStableHs: poolHr.displayHs || poolHr.instantHs || poolHr.stableHs,
  });
  const shownHs = picked.hs;
  const hrSource = picked.source === "none" ? "pool" : picked.source;
  const deviceAgeMs =
    deviceHr.device?.fetchedAt != null
      ? Math.max(0, nowTick - deviceHr.device.fetchedAt)
      : null;
  const deviceIsSticky =
    hrSource === "device" && deviceHr.device != null && deviceHr.device.live === false;

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
    setDeviceIpDraft(getStoredDeviceIp());
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

  async function handleDeviceLink() {
    const ip = normalizeDeviceHost(deviceIpDraft);
    if (!ip) return;
    setDeviceIpDraft(ip);
    setDeviceLinking(true);
    try {
      await deviceHr.connect(ip);
    } finally {
      window.setTimeout(() => setDeviceLinking(false), 350);
    }
  }

  async function handleDeviceScan() {
    setDeviceScanning(true);
    setDeviceLinking(true);
    try {
      const found = await deviceHr.scanLan();
      if (found.length > 0) {
        setDeviceIpDraft(found[0].ip);
      }
    } finally {
      setDeviceScanning(false);
      window.setTimeout(() => setDeviceLinking(false), 350);
    }
  }

  /** Connection light for device link row */
  const deviceLinkStatus: "idle" | "loading" | "ok" | "fail" = (() => {
    if (deviceLinking || deviceScanning) return "loading";
    if (!deviceHr.hasDevice || !deviceHr.ip) return "idle";
    if (deviceHr.device?.online && deviceHr.device.live !== false) return "ok";
    if (deviceHr.hasLiveHashrate) return "ok"; // sticky hashrate
    if (deviceHr.error || deviceHr.device?.online === false) return "fail";
    return "idle";
  })();

  const deviceTemp =
    deviceHr.device?.temp != null && Number.isFinite(Number(deviceHr.device.temp))
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
    <div className="min-h-dvh pb-24 sm:pb-20 bg-[var(--bg)] text-[var(--fg)] overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-3 py-2 space-y-2">
          {/* Row 1: brand + status */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-sm shrink-0">
              ⚡
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="text-sm font-bold leading-tight shrink-0">
                  Solo<span className="text-amber-500">Pulse</span>
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

        {net && <NetworkBar network={net} />}

        {/* ① Hashrate — stacked on mobile, side panel only sm+ */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {hrSource === "device"
                    ? deviceIsSticky
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
                {hrSource === "device" && deviceHr.device && (
                  <span className="text-[9px] text-emerald-500 font-mono normal-case leading-snug break-all">
                    {deviceHr.device.deviceModel}
                    {deviceHr.ip ? ` · ${deviceHr.ip}` : ""}
                    {deviceAgeMs != null
                      ? ` · ${deviceIsSticky ? "hold " : ""}${(deviceAgeMs / 1000).toFixed(0)}s`
                      : ""}
                    {" · 1s"}
                  </span>
                )}
                {hrSource !== "device" && (
                  <span className="text-[9px] text-amber-500 font-mono normal-case">
                    pool 1m · 2s
                  </span>
                )}
              </div>

              <div className="text-[1.65rem] sm:text-4xl font-bold font-mono text-[var(--fg)] tabular-nums tracking-tight leading-none">
                {shownHs > 0 ? formatHashrateGhs(shownHs, 2) : "—"}
              </div>
              {shownHs > 0 && (
                <div className="text-sm font-mono text-amber-500 tabular-nums">
                  {formatHashrate(shownHs, 3)}
                </div>
              )}

              <div className="text-[10px] font-mono text-[var(--muted)] leading-relaxed break-all">
                {hrSource === "device" && deviceHr.device ? (
                  <>
                    <span className="text-emerald-500">DEVICE</span> live{" "}
                    {Number(
                      deviceHr.device.windows?.instantGhs || deviceHr.device.hashRateGhs
                    ).toFixed(2)}{" "}
                    · 1m {deviceHr.device.windows.m1Ghs.toFixed(2)} · 10m{" "}
                    {deviceHr.device.windows.m10Ghs.toFixed(2)} · 1h{" "}
                    {deviceHr.device.windows.h1Ghs.toFixed(2)} GH/s
                    {deviceHr.device.temp != null &&
                      Number.isFinite(deviceHr.device.temp) &&
                      ` · ${deviceHr.device.temp.toFixed(1)}°C`}
                    {deviceHr.device.power != null &&
                      Number.isFinite(deviceHr.device.power) &&
                      ` · ${deviceHr.device.power.toFixed(1)}W`}
                  </>
                ) : (
                  <>
                    <span className="text-amber-500">POOL</span> 1m {u.hashrate1m || "—"} · 5m{" "}
                    {u.hashrate5m || "—"} · 1h {u.hashrate1hr || "—"}
                    <span className="text-[var(--muted)]">
                      {" "}
                      ({formatHashrate(poolHr.displayHs || poolHr.stableHs, 2)} ·{" "}
                      {poolHr.source})
                    </span>
                  </>
                )}
              </div>

              {deviceHr.hasDevice && hrSource !== "device" && (
                <div className="text-[10px] leading-relaxed text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2 break-words space-y-1">
                  <div className="font-medium text-amber-300">
                    {locale === "ko"
                      ? `보드 실측 대기 · ${deviceHr.ip || "—"} · 풀 데이터는 정상 동작 중`
                      : `Board offline · ${deviceHr.ip || "—"} · pool data still live`}
                  </div>
                  {deviceHr.error && (
                    <div className="text-amber-100/80 font-mono break-all text-[9px]">
                      {deviceHr.error}
                    </div>
                  )}
                  <div className="text-[9px] text-amber-100/75 leading-relaxed">
                    {locale === "ko"
                      ? "① AxeOS IP 확인 후 기기 연결 (현재 예: 172.30.1.99) ② 같은 Wi‑Fi + 로컬 서버면 자동 검색 가능 ③ solopulse.netlify.app 에서는 집 PC start-miner-tunnel.bat URL 또는 사이트 터널 설정 필요"
                      : "① Use exact AxeOS IP ② LAN scan needs home server ③ On solopulse.netlify.app use miner tunnel URL"}
                  </div>
                </div>
              )}
              {!deviceHr.hasDevice && (
                <div className="text-[10px] text-amber-500/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
                  {locale === "ko"
                    ? "기기 IP를 넣고 「기기 연결」또는 「자동 검색」을 누르세요. 보드 실측 해시가 표시됩니다."
                    : "Enter miner IP and Link / Scan LAN for live board hashrate."}
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

              {/* Device IP + link (no pool-only — board hashrate is the goal) */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-1.5 pt-0.5">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={deviceIpDraft}
                  onChange={(e) => setDeviceIpDraft(e.target.value)}
                  placeholder="172.x.x.x or https://miner-tunnel…"
                  className="text-[11px] font-mono rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 w-full sm:flex-1 sm:min-w-[12rem] text-[var(--fg)] min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleDeviceLink();
                    }
                  }}
                />
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <button
                    type="button"
                    disabled={deviceLinking || !deviceIpDraft.trim()}
                    className={`text-[11px] px-3 py-2 rounded-lg font-medium border transition-colors disabled:opacity-50 ${
                      deviceLinking && !deviceScanning
                        ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/30"
                        : "bg-zinc-950 text-zinc-100 border-zinc-700 hover:border-zinc-500"
                    }`}
                    onClick={() => void handleDeviceLink()}
                  >
                    {locale === "ko" ? "기기 연결" : "Link device"}
                  </button>
                  <button
                    type="button"
                    disabled={deviceLinking || deviceScanning}
                    className={`text-[11px] px-3 py-2 rounded-lg font-medium border transition-colors disabled:opacity-50 ${
                      deviceScanning
                        ? "bg-amber-500 text-zinc-950 border-amber-400"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                    }`}
                    onClick={() => void handleDeviceScan()}
                    title={
                      locale === "ko"
                        ? "같은 Wi‑Fi에서 AxeOS 자동 검색 (집 PC 서버 필요)"
                        : "Auto-scan LAN for AxeOS (home server required)"
                    }
                  >
                    {deviceScanning
                      ? locale === "ko"
                        ? "검색 중…"
                        : "Scanning…"
                      : locale === "ko"
                        ? "자동 검색"
                        : "Scan LAN"}
                  </button>
                  {/* Spinner while connecting — was 풀만 slot */}
                  {deviceLinking ? (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center shrink-0"
                      title={locale === "ko" ? "연결 중…" : "Connecting…"}
                    >
                      <span className="h-4 w-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                    </span>
                  ) : (
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${
                        deviceLinkStatus === "ok"
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : deviceLinkStatus === "fail"
                            ? "border-red-500/50 bg-red-500/10"
                            : "border-[var(--border)] bg-[var(--bg)]"
                      }`}
                      title={
                        deviceLinkStatus === "ok"
                          ? locale === "ko"
                            ? "기기 연결됨"
                            : "Device online"
                          : deviceLinkStatus === "fail"
                            ? locale === "ko"
                              ? "기기 연결 실패"
                              : "Device offline"
                            : locale === "ko"
                              ? "연결 대기"
                              : "Not linked"
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
                              : deviceLinkStatus === "fail"
                                ? "bg-red-500"
                                : "bg-zinc-600"
                          }`}
                        />
                      </span>
                    </span>
                  )}
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
              Math.max(Number(u.workers) || 0, deviceHr.device?.online ? 1 : 0)
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
              deviceHr.device?.sharesAccepted || u.shares || 0
            ).toLocaleString()}
            sub={
              deviceHr.device?.sharesRejected
                ? `rej ${deviceHr.device.sharesRejected}`
                : undefined
            }
          />
          <StatCard
            label={t("bestShare")}
            value={formatDifficulty(
              Math.max(
                Number(u.bestshare || 0),
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
                Number(deviceHr.device?.bestDiff || 0)
              )
            )}
            accent="pulse"
          />
        </div>

        {/* ② Unified Source + MAX ENGINE */}
        {difficulty > 0 && (
          <SourceEngineHub
            tick={liveTick}
            hashrateBase={shownHs}
            bestShare={bestForLadder || bestShare}
            networkDiff={difficulty}
            networkHashrateHs={Number(net?.hashrate) || 0}
            lastShare={u.lastshare || 0}
            authorised={u.authorised || 0}
            shares={Number(deviceHr.device?.sharesAccepted || u.shares || 0)}
            workers={Number(u.workers || 0)}
            pool={dash.pool}
            foundBlocks={deviceHr.device?.foundBlocks || 0}
            deviceOnline={!!deviceHr.device?.online}
            hasDevice={deviceHr.hasDevice}
          />
        )}

        {/* 해시레이트 기록 (1초 샘플) — 소스엔진 바로 아래 */}
        <HashrateChart samples={chartSamples} />

        {/* ③ Mempool */}
        <MempoolBlocks />

        {net && (
          <BestShareBar
            bestShare={Number(u.bestshare || bestForLadder || 0)}
            bestEver={Number(u.bestever || 0)}
            networkDifficulty={net.difficulty || difficulty}
          />
        )}

        <LiveOddsPanel tick={liveTick} />

        <SoloCasePanel
          tick={liveTick}
          hashrateBase={shownHs}
          bestShare={bestForLadder || bestShare}
          networkDiff={difficulty}
        />

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
                    <div className="text-xs font-mono text-[var(--fg)] truncate max-w-[200px] sm:max-w-md">
                      {w.workername.includes(".")
                        ? w.workername.split(".").slice(1).join(".") ||
                          w.workername
                        : w.workername || "default"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">
                      last {w.lastshare ? formatTimeAgo(w.lastshare) : "—"}
                    </div>
                  </div>
                  <div className="text-right min-w-0">
                    <div className="text-sm font-mono font-semibold text-amber-500 break-all">
                      {w.hashrate5m || w.hashrate1m || "—"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] font-mono">
                      best {formatDifficulty(Number(w.bestshare || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap justify-center items-center gap-2">
          <a
            href="https://x.com/medbedeee"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
          >
            𝕏 {t("feedback")}
          </a>
          <LightningTip variant="pill" />
        </div>

        <footer className="pt-2 pb-4 text-center text-[10px] text-[var(--muted)] leading-relaxed">
          {t("footer")}
          <br />
          Pool · optional LAN device ·{" "}
          <BtcDisclaimer className="align-middle" />
        </footer>
      </main>

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
