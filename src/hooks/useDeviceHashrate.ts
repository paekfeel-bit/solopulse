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
  type DeviceInfo,
} from "@/lib/deviceClient";

export type { DeviceInfo };

const POLL_MS = 3_000;
const STICKY_MS = 120_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Device hashrate: server proxy (required for HTTPS/Netlify)
 * + optional browser direct on plain HTTP LAN.
 * Soft-fail: pool dashboard keeps working if board is offline.
 */
export function useDeviceHashrate(enabled: boolean) {
  const [ip, setIpState] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() : "172.30.1.99"
  );
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "online" | "offline"
  >("idle");
  const lastGood = useRef<DeviceInfo | null>(null);
  const busy = useRef(false);
  const ipRef = useRef(ip);
  const didAutoScan = useRef(false);

  useEffect(() => {
    ipRef.current = ip;
  }, [ip]);

  useEffect(() => {
    const stored = getStoredDeviceIp();
    if (stored) {
      setIpState(stored);
      ipRef.current = stored;
    }
  }, []);

  const setIp = useCallback((next: string) => {
    const v = normalizeDeviceHost(next);
    setStoredDeviceIp(v);
    setIpState(v);
    ipRef.current = v;
    if (!v) {
      setDevice(null);
      lastGood.current = null;
      setError(null);
      setStatus("idle");
    }
  }, []);

  const hasDevice = enabled && normalizeDeviceHost(ip).length > 0;

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
      const target = normalizeDeviceHost(overrideIp ?? ipRef.current);
      if (!target || !isValidDeviceHost(target)) {
        if (force) setError("올바른 기기 IP / 터널 URL을 입력하세요");
        return null;
      }
      // Always allow force connect even if previous poll stuck
      if (busy.current && !force) return lastGood.current;
      busy.current = true;
      if (force) setStatus("connecting");

      try {
        let lastErr = "";

        // Proxy first (Netlify function / home server)
        for (let a = 1; a <= 2; a++) {
          try {
            const ac = new AbortController();
            const timer = window.setTimeout(() => ac.abort(), 16_000);
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
              lastErr =
                res.status === 404 || text.includes("<html")
                  ? "앱 API 없음 — 배포 빌드 확인 필요"
                  : `잘못된 응답 (HTTP ${res.status})`;
              await sleep(250 * a);
              continue;
            }
            if (res.ok && j.online !== false) {
              return applyOk({
                ...(j as unknown as DeviceInfo),
                via: "proxy",
                ip: String(j.ip || target),
              });
            }
            const hint = j.hint ? String(j.hint) : "";
            const base = String(j.error || `offline HTTP ${res.status}`);
            lastErr = hint ? `${base} · ${hint}` : base;
            // private LAN on cloud — don't waste second long retry the same way
            if (j.privateLan && !j.triedTunnel) break;
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            lastErr = /abort/i.test(m)
              ? "시간 초과 — IP·터널·전원을 확인하세요"
              : /Failed to fetch|NetworkError|Load failed|fetch/i.test(m)
                ? "네트워크 오류 — 페이지 새로고침 후 다시 시도"
                : m;
          }
          await sleep(300 * a);
        }

        // Browser direct (HTTP pages only — HTTPS blocks mixed content to LAN)
        if (canBrowserReachDevice(target)) {
          const d = await fetchDeviceDirect(target, 7000);
          if (d.ok) return applyOk(d.info);
          lastErr = d.error || lastErr;
        }

        return applyFail(target, lastErr || "기기 연결 실패");
      } finally {
        busy.current = false;
      }
    },
    [applyFail, applyOk]
  );

  const connect = useCallback(
    async (rawIp: string) => {
      const v = normalizeDeviceHost(rawIp);
      if (!v || !isValidDeviceHost(v)) {
        setError(
          "허용되지 않는 주소 (LAN IP 예: 172.30.1.99 또는 https://…trycloudflare.com)"
        );
        setStatus("offline");
        return null;
      }
      // reset sticky busy so force connect always runs
      busy.current = false;
      setIp(v);
      await sleep(20);
      return fetchDevice(v, true);
    },
    [setIp, fetchDevice]
  );

  const scanLan = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), 45_000);
      const res = await fetch(
        `/api/device/scan?hint=${encodeURIComponent(ipRef.current || "172.30.1.99")}&_=${Date.now()}`,
        { cache: "no-store", signal: ac.signal }
      );
      window.clearTimeout(timer);
      const j = await res.json();
      const found = (j.found || []) as Array<{ ip: string }>;
      if (found[0]?.ip) {
        // Prefer connecting with the stored/LAN hint if tunnel mapped it
        const connectTarget = found[0].ip;
        await connect(connectTarget);
        return found;
      }
      setError(
        String(
          j.note ||
            "LAN에서 NerdQAxe를 못 찾았습니다. AxeOS 화면 IP를 넣고 기기 연결을 누르세요."
        )
      );
      setStatus("offline");
      return [];
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(
        /abort/i.test(m)
          ? "자동 검색 시간 초과 — AxeOS IP를 직접 입력해 보세요"
          : "자동 검색 실패 — Netlify면 채굴기 터널 URL을 기기 칸에 넣으세요"
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
      const r = await fetchDevice(undefined, true);
      if (cancelled) return;
      if (!r && !didAutoScan.current) {
        didAutoScan.current = true;
        const t = ipRef.current;
        // Auto-scan once for private IPs (works on home server; on Netlify uses tunnel env)
        if (t && !t.includes("trycloudflare") && !/^https:\/\//i.test(t)) {
          await scanLan();
        }
      }
    })();
    const id = setInterval(() => {
      void fetchDevice(undefined, false);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasDevice, ip, fetchDevice, scanLan]);

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
      return fetchDevice(undefined, true);
    },
    connect,
    scanLan,
    hasLiveHashrate: !!(device?.online && (liveHs > 0 || liveGhs > 0)),
    isLivePoll: !!(device?.live && device?.online),
  };
}
