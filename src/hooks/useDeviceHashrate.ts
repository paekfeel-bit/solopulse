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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    // Migrate empty / force cloud default
    let stored = getStoredDeviceIp();
    if (!stored || stored === "undefined") {
      stored = isCloudHostedPage() ? "auto" : getStoredDeviceIp() || "auto";
      setStoredDeviceIp(stored === "auto" ? "auto" : stored);
    }
    // On cloud, prefer auto so DHCP LAN IPs never block connect
    if (isCloudHostedPage() && isPrivateIPv4(stored)) {
      // keep LAN for display but connect via auto — store both
      // actually switch to auto for reliability
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
      if (!primary) primary = "auto";
      const isAuto = primary.toLowerCase() === "auto" || primary.toLowerCase() === "bridge";

      if (!isAuto && !isValidDeviceHost(primary)) {
        if (force) setError("올바른 기기 IP / 터널 URL / auto");
        return null;
      }
      if (busy.current && !force) return lastGood.current;
      busy.current = true;
      if (force) setStatus("connecting");

      try {
        let lastErr = "";
        const candidates: string[] = [];
        if (isAuto || (isCloudHostedPage() && isPrivateIPv4(primary))) {
          candidates.push("auto");
        }
        if (!isAuto) candidates.push(primary);
        const tun = getStoredTunnel();
        if (tun && !candidates.includes(tun)) candidates.push(tun);

        for (const target of candidates) {
          for (let a = 1; a <= 2; a++) {
            try {
              const ac = new AbortController();
              const timer = window.setTimeout(() => ac.abort(), 20_000);
              const res = await fetch(
                `/api/device?ip=${encodeURIComponent(target)}&_=${Date.now()}&n=${a}`,
                { cache: "no-store", signal: ac.signal }
              );
              window.clearTimeout(timer);
              const text = await res.text();
              let j: Record<string, unknown>;
              try {
                j = JSON.parse(text) as Record<string, unknown>;
              } catch {
                lastErr = `잘못된 응답 HTTP ${res.status}`;
                continue;
              }
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
              const hint = j.hint ? ` · ${String(j.hint)}` : "";
              lastErr = `${String(j.error || `HTTP ${res.status}`)}${hint}`;
            } catch (e) {
              const m = e instanceof Error ? e.message : String(e);
              lastErr = /abort/i.test(m)
                ? "시간 초과"
                : /Failed to fetch|NetworkError/i.test(m)
                  ? "네트워크 오류"
                  : m;
            }
            await sleep(200 * a);
          }

          if (!isAuto && canBrowserReachDevice(target)) {
            const d = await fetchDeviceDirect(target, 7000);
            if (d.ok) return applyOk(d.info);
            lastErr = d.error || lastErr;
          }
        }

        if (isCloudHostedPage()) {
          lastErr =
            lastErr ||
            "집 PC에서 start-device-bridge.bat 을 실행하세요. (한 번만 켜 두면 IP가 바뀌어도 자동 연결)";
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
        // allow typing "auto"
        if (v.toLowerCase() !== "auto") {
          setError("허용되지 않는 주소 — auto / LAN IP / trycloudflare URL");
          setStatus("offline");
          return null;
        }
        v = "auto";
      }
      busy.current = false;
      setIp(v);
      await sleep(30);
      return fetchDevice(v, true);
    },
    [setIp, fetchDevice]
  );

  const scanLan = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), 55_000);
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
        if (found[0].ip && isPrivateIPv4(found[0].ip)) {
          // show LAN IP in draft via return value; connect with auto/tunnel
        }
        await connect(connectTo === found[0].ip && isCloudHostedPage() ? "auto" : connectTo);
        return found;
      }

      // Force auto connect on cloud
      if (isCloudHostedPage()) {
        const r = await connect("auto");
        if (r) return [{ ip: r.ip || "auto" }];
      }

      setError(
        String(
          j.note ||
            "장비를 찾지 못했습니다. 집 PC에서 start-device-bridge.bat 실행 후 다시 「자동 검색」"
        )
      );
      setStatus("offline");
      return [];
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      // Last resort: auto
      const r = await connect("auto");
      if (r) return [{ ip: "auto" }];
      setError(
        /abort/i.test(m)
          ? "검색 시간 초과 — start-device-bridge.bat 실행 여부 확인"
          : "검색 실패 — start-device-bridge.bat 을 실행하세요"
      );
      setStatus("offline");
      return [];
    }
  }, [connect]);

  useEffect(() => {
    if (!hasDevice) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    (async () => {
      // Boot: always try auto on cloud first
      if (!didBoot.current && isCloudHostedPage()) {
        didBoot.current = true;
        setIp("auto");
        await sleep(50);
        const r = await fetchDevice("auto", true);
        if (cancelled) return;
        if (!r) await scanLan();
        return;
      }
      didBoot.current = true;
      const r = await fetchDevice(undefined, true);
      if (cancelled) return;
      if (!r) await scanLan();
    })();
    const id = setInterval(() => {
      void fetchDevice(undefined, false);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasDevice, ip, fetchDevice, scanLan, setIp]);

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
