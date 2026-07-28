"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoredDeviceIp,
  isValidDeviceHost,
  normalizeDeviceHost,
  setStoredDeviceIp,
} from "@/lib/history";
import {
  canBrowserReachDevice,
  fetchDeviceDirect,
  isCloudHostedPage,
  isPrivateIPv4,
  parseDeviceTarget,
  type DeviceInfo,
} from "@/lib/deviceClient";

export type { DeviceInfo };

const POLL_MS = 3_000;
const STICKY_MS = 180_000;
const TUNNEL_LS_KEY = "solopulse:deviceTunnel";
/** Fast path timeouts — user-facing connect must feel instant */
const CONNECT_FETCH_MS = 6_000;
const SCAN_FETCH_MS = 12_000;
const DIRECT_FETCH_MS = 3_500;

function getStoredTunnel(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeDeviceHost(localStorage.getItem(TUNNEL_LS_KEY) || "");
  } catch {
    return "";
  }
}

function setStoredTunnel(url: string) {
  if (typeof window === "undefined") return;
  try {
    const v = normalizeDeviceHost(url);
    if (v) localStorage.setItem(TUNNEL_LS_KEY, v);
    else localStorage.removeItem(TUNNEL_LS_KEY);
  } catch {
    /* */
  }
}

function isTunnelHost(raw: string): boolean {
  const t = parseDeviceTarget(raw);
  if (!t) return false;
  return !t.privateLan && /^https:\/\//i.test(t.base);
}

/**
 * Always works with start-device-bridge.bat on home PC:
 * - Cloud: connects via ip=auto (live tunnel registry)
 * - LAN IP still accepted (server falls back to registry tunnel)
 */
export function useDeviceHashrate(enabled: boolean) {
  const [ip, setIpState] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() : "auto"
  );
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "online" | "offline"
  >("idle");
  const lastGood = useRef<DeviceInfo | null>(null);
  const busy = useRef(false);
  const ipRef = useRef(ip);
  const didBoot = useRef(false);

  useEffect(() => {
    ipRef.current = ip;
  }, [ip]);

  useEffect(() => {
    // Keep user-chosen IP (including LAN). Empty → auto.
    let stored = getStoredDeviceIp();
    if (!stored || stored === "undefined") {
      stored = "auto";
      setStoredDeviceIp("auto");
    }
    setIpState(stored);
    ipRef.current = stored;
  }, []);

  const setIp = useCallback((next: string) => {
    const v = normalizeDeviceHost(next) || next.trim().toLowerCase();
    const final = v === "auto" || v === "bridge" ? "auto" : v;
    setStoredDeviceIp(final);
    setIpState(final);
    ipRef.current = final;
    if (final !== "auto" && isTunnelHost(final)) setStoredTunnel(final);
    if (!final) {
      setDevice(null);
      lastGood.current = null;
      setError(null);
      setStatus("idle");
    }
  }, []);

  const hasDevice =
    enabled &&
    (ip === "auto" ||
      ip === "bridge" ||
      normalizeDeviceHost(ip).length > 0);

  const applyOk = useCallback((info: DeviceInfo) => {
    if (info.temp != null && !Number.isFinite(Number(info.temp))) info.temp = null;
    if (info.power != null && !Number.isFinite(Number(info.power))) info.power = null;
    const ghs = Number(info.hashRateGhs) || Number(info.windows?.instantGhs) || 0;
    if (ghs > 0) {
      info.hashRateGhs = ghs;
      info.hashRateHs = ghs * 1e9;
    }
    info.fetchedAt = Date.now();
    info.online = true;
    info.live = true;
    lastGood.current = info;
    setDevice(info);
    setError(null);
    setStatus("online");
    // Remember real LAN IP for display
    if (info.ip && isPrivateIPv4(String(info.ip).replace(/:\d+$/, ""))) {
      /* keep ipRef as auto on cloud; draft may update in UI */
    }
    return info;
  }, []);

  const applyFail = useCallback((target: string, errMsg: string) => {
    setError(errMsg);
    setStatus("offline");
    const lg = lastGood.current;
    if (lg && Date.now() - lg.fetchedAt < STICKY_MS && lg.hashRateGhs > 0) {
      setDevice({ ...lg, online: true, live: false, error: errMsg });
      return lg;
    }
    setDevice({
      online: false,
      live: false,
      ip: target,
      deviceModel: "",
      hashRateGhs: 0,
      hashRateHs: 0,
      windows: { instantGhs: 0, m1Ghs: 0, m10Ghs: 0, h1Ghs: 0, d1Ghs: 0 },
      temp: null,
      power: null,
      bestDiff: 0,
      bestSessionDiff: 0,
      networkDifficulty: 0,
      foundBlocks: 0,
      totalFoundBlocks: 0,
      sharesAccepted: 0,
      sharesRejected: 0,
      fetchedAt: Date.now(),
      error: errMsg,
    });
    return null;
  }, []);

  const fetchDevice = useCallback(
    async (overrideIp?: string, force = false) => {
      let primary = (overrideIp ?? ipRef.current ?? "auto").trim();
      if (!primary) primary = "auto";
      const isAuto =
        primary.toLowerCase() === "auto" || primary.toLowerCase() === "bridge";

      if (!isAuto && !isValidDeviceHost(primary)) {
        if (force) setError("올바른 기기 IP / 터널 URL / auto");
        return null;
      }
      if (busy.current && !force) return lastGood.current;
      busy.current = true;
      if (force) {
        setStatus("connecting");
        setError(null);
      }

      try {
        let lastErr = "";
        const candidates: string[] = [];
        // Prefer exact IP first (faster than always hitting auto/tunnel first)
        if (!isAuto) candidates.push(primary);
        if (isAuto || (isCloudHostedPage() && isPrivateIPv4(primary))) {
          candidates.push("auto");
        }
        const tun = getStoredTunnel();
        if (tun && !candidates.includes(tun)) candidates.push(tun);

        // Parallel first wave: primary + auto (race — first success wins)
        const raceTargets = [...new Set(candidates.slice(0, 2))];
        const race = await Promise.any(
          raceTargets.map(async (target) => {
            // 1) browser direct (LAN) when possible — usually fastest at home
            if (!isAuto && canBrowserReachDevice(target)) {
              const d = await fetchDeviceDirect(target, DIRECT_FETCH_MS);
              if (d.ok) {
                return applyOk(d.info);
              }
            }
            const ac = new AbortController();
            const timer = window.setTimeout(() => ac.abort(), CONNECT_FETCH_MS);
            try {
              const res = await fetch(
                `/api/device?ip=${encodeURIComponent(target)}&_=${Date.now()}`,
                { cache: "no-store", signal: ac.signal }
              );
              const text = await res.text();
              const j = JSON.parse(text) as Record<string, unknown>;
              if (res.ok && j.online !== false) {
                if (typeof j.publicTunnel === "string" && j.publicTunnel) {
                  setStoredTunnel(String(j.publicTunnel));
                }
                return applyOk({
                  ...(j as unknown as DeviceInfo),
                  via: "proxy",
                  ip: String(j.ip || target),
                });
              }
              throw new Error(
                `${String(j.error || `HTTP ${res.status}`)}${
                  j.hint ? ` · ${String(j.hint)}` : ""
                }`
              );
            } finally {
              window.clearTimeout(timer);
            }
          })
        ).catch((e: unknown) => {
          if (e instanceof AggregateError && e.errors?.length) {
            lastErr = String(
              (e.errors[0] as Error)?.message || e.errors[0] || "fail"
            );
          } else if (e instanceof Error) {
            lastErr = e.message;
          }
          return null;
        });

        if (race) return race;

        // Fallback: remaining candidates, one attempt each
        for (const target of candidates.slice(2)) {
          try {
            if (canBrowserReachDevice(target)) {
              const d = await fetchDeviceDirect(target, DIRECT_FETCH_MS);
              if (d.ok) return applyOk(d.info);
            }
            const ac = new AbortController();
            const timer = window.setTimeout(() => ac.abort(), CONNECT_FETCH_MS);
            const res = await fetch(
              `/api/device?ip=${encodeURIComponent(target)}&_=${Date.now()}`,
              { cache: "no-store", signal: ac.signal }
            );
            window.clearTimeout(timer);
            const j = (await res.json()) as Record<string, unknown>;
            if (res.ok && j.online !== false) {
              if (typeof j.publicTunnel === "string" && j.publicTunnel) {
                setStoredTunnel(String(j.publicTunnel));
              }
              return applyOk({
                ...(j as unknown as DeviceInfo),
                via: "proxy",
                ip: String(j.ip || target),
              });
            }
            lastErr = String(j.error || `HTTP ${res.status}`);
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            lastErr = /abort/i.test(m) ? "시간 초과" : m;
          }
        }

        if (isCloudHostedPage()) {
          lastErr =
            lastErr ||
            "브리지/터널 없음 — 하단 「브리지」탭에서 .bat 실행 후 다시 연결";
        }

        return applyFail(primary, lastErr || "기기 연결 실패");
      } finally {
        busy.current = false;
      }
    },
    [applyFail, applyOk]
  );

  const connect = useCallback(
    async (rawIp: string) => {
      let v = normalizeDeviceHost(rawIp) || rawIp.trim();
      if (!v) v = "auto";
      if (v.toLowerCase() === "bridge") v = "auto";
      if (v !== "auto" && !isValidDeviceHost(v)) {
        if (v.toLowerCase() !== "auto") {
          setError("허용되지 않는 주소 — auto / LAN IP / trycloudflare URL");
          setStatus("offline");
          return null;
        }
        v = "auto";
      }
      // Instant UI feedback
      setStatus("connecting");
      setError(null);
      busy.current = false;
      setIp(v);
      return fetchDevice(v, true);
    },
    [setIp, fetchDevice]
  );

  /**
   * Fast auto-scan:
   * 1) agent telemetry (bridge already streaming?) ~1s
   * 2) /api/device?ip=auto ~6s
   * 3) short LAN scan only if still needed
   */
  const scanLan = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    // 1) Prefer live bridge feed via agent API (fastest when bridge is on)
    try {
      const ac = new AbortController();
      const t = window.setTimeout(() => ac.abort(), 2500);
      const res = await fetch(
        `/api/agent/telemetry?clientId=default&_=${Date.now()}`,
        { cache: "no-store", signal: ac.signal }
      );
      window.clearTimeout(t);
      if (res.ok) {
        const j = (await res.json()) as {
          online?: boolean;
          telemetry?: {
            hashRateGhs?: number;
            hostIp?: string;
            tempC?: number | null;
            powerW?: number | null;
            deviceModel?: string;
            collectedAt?: number;
          };
        };
        const ghs = Number(j.telemetry?.hashRateGhs) || 0;
        const age = j.telemetry?.collectedAt
          ? Date.now() - j.telemetry.collectedAt
          : 999999;
        if (j.online && ghs > 0 && age < 90_000) {
          const ip = String(j.telemetry?.hostIp || "auto");
          applyOk({
            online: true,
            live: true,
            ip,
            deviceModel: String(j.telemetry?.deviceModel || "NerdQAxe"),
            hashRateGhs: ghs,
            hashRateHs: ghs * 1e9,
            windows: {
              instantGhs: ghs,
              m1Ghs: ghs,
              m10Ghs: ghs,
              h1Ghs: ghs,
              d1Ghs: ghs,
            },
            temp: j.telemetry?.tempC ?? null,
            power: j.telemetry?.powerW ?? null,
            bestDiff: 0,
            bestSessionDiff: 0,
            networkDifficulty: 0,
            foundBlocks: 0,
            totalFoundBlocks: 0,
            sharesAccepted: 0,
            sharesRejected: 0,
            fetchedAt: Date.now(),
            via: "proxy",
          });
          setIp(ip && isPrivateIPv4(ip) ? ip : "auto");
          return [{ ip }];
        }
      }
    } catch {
      /* fall through */
    }

    // 2) Quick auto device endpoint
    const quick = await connect("auto");
    if (quick) return [{ ip: quick.ip || "auto" }];

    // 3) Short scan (capped ~12s, not 55s)
    try {
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), SCAN_FETCH_MS);
      const res = await fetch(
        `/api/device/scan?hint=${encodeURIComponent(ipRef.current || "auto")}&_=${Date.now()}`,
        { cache: "no-store", signal: ac.signal }
      );
      window.clearTimeout(timer);
      const j = await res.json();
      const found = (j.found || []) as Array<{
        ip: string;
        connectIp?: string;
      }>;

      if (j.tunnel && typeof j.tunnel === "string") {
        setStoredTunnel(j.tunnel);
      }

      if (found[0]) {
        const connectTo = found[0].connectIp || found[0].ip || "auto";
        await connect(
          connectTo === found[0].ip && isCloudHostedPage() ? "auto" : connectTo
        );
        return found;
      }

      setError(
        String(
          j.note ||
            "장비를 찾지 못함 — 브리지 탭에서 .bat 실행 후 다시 「자동 검색」"
        )
      );
      setStatus("offline");
      return [];
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(
        /abort/i.test(m)
          ? "검색 시간 초과 — 브리지 실행 여부 확인"
          : "검색 실패 — 브리지 .bat 을 실행하세요"
      );
      setStatus("offline");
      return [];
    }
  }, [connect, applyOk, setIp]);

  useEffect(() => {
    if (!hasDevice) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    (async () => {
      // Boot: one quick connect only (no automatic 55s scan — that felt stuck)
      if (!didBoot.current) {
        didBoot.current = true;
        await fetchDevice(undefined, true);
        return;
      }
      await fetchDevice(undefined, true);
    })();
    const id = setInterval(() => {
      if (!cancelled) void fetchDevice(undefined, false);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasDevice, ip, fetchDevice]);

  const liveGhs = Number(device?.hashRateGhs) || 0;
  const liveHs = Number(device?.hashRateHs) || 0;

  return {
    device,
    error,
    ip,
    setIp,
    hasDevice,
    status,
    refresh: () => {
      busy.current = false;
      return fetchDevice(isCloudHostedPage() ? "auto" : undefined, true);
    },
    connect,
    scanLan,
    hasLiveHashrate: !!(device?.online && (liveHs > 0 || liveGhs > 0)),
    isLivePoll: !!(device?.live && device?.online),
    isCloud: typeof window !== "undefined" ? isCloudHostedPage() : false,
  };
}
