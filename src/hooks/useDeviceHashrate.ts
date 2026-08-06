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
import {
  DEVICE_MSG,
  buildMinerBookmarklet,
  deviceInfoFromMessage,
  downloadDeviceConnector,
  isMixedContentBlockLikely,
  openDeviceConnector,
  openMinerHome,
} from "@/lib/deviceConnector";

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
 * Board path (no install):
 * 1) Browser direct when allowed (HTTP page / Capacitor / public HTTPS tunnel)
 * 2) Same-origin /api/device proxy (cloud can only reach public tunnel/public IP)
 * 3) data: URL connector window — same Wi‑Fi, bypasses HTTPS mixed-content
 *    (typing IP in the address bar works; that is what the connector reuses)
 */
export function useDeviceHashrate(enabled: boolean, clientId = "default") {
  const [ip, setIpState] = useState(() =>
    typeof window !== "undefined" ? getStoredDeviceIp() : "auto"
  );
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "online" | "offline"
  >("idle");
  /** Popup blocked → show manual open/download */
  const [needConnectorClick, setNeedConnectorClick] = useState(false);
  const [needBookmarklet, setNeedBookmarklet] = useState(false);
  const [connectorIp, setConnectorIp] = useState("");
  const lastGood = useRef<DeviceInfo | null>(null);
  const busy = useRef(false);
  const ipRef = useRef(ip);
  const didBoot = useRef(false);
  const clientIdRef = useRef(clientId);

  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);

  useEffect(() => {
    ipRef.current = ip;
  }, [ip]);

  useEffect(() => {
    // Keep user choice: empty = pool-only (no board probe), auto = optional discovery
    let stored = getStoredDeviceIp();
    if (stored === "undefined" || stored == null) stored = "";
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
    setNeedConnectorClick(false);
    setNeedBookmarklet(false);
    // Remember real LAN IP for display
    if (info.ip && isPrivateIPv4(String(info.ip).replace(/:\d+$/, ""))) {
      const clean = String(info.ip).replace(/:\d+$/, "");
      if (ipRef.current === "auto" || !ipRef.current) {
        setStoredDeviceIp(clean);
        setIpState(clean);
        ipRef.current = clean;
      }
    }
    return info;
  }, []);

  const launchConnector = useCallback((rawIp: string) => {
    const host = normalizeDeviceHost(rawIp) || rawIp.trim();
    if (!host || host === "auto") return false;
    setConnectorIp(host);
    // Open miner home (same as typing IP in address bar) + connector reader
    openMinerHome(host);
    const w = openDeviceConnector({
      ip: host,
      clientId: clientIdRef.current || "default",
    });
    if (!w) {
      setNeedConnectorClick(true);
      setNeedBookmarklet(true);
      setError(
        "팝업 차단 또는 CORS — 「연동 창 열기」또는 기기 홈에서 북마크릿 실행"
      );
      return false;
    }
    setNeedConnectorClick(false);
    setNeedBookmarklet(true);
    setError(
      "연동 중… 연동 창을 유지하세요. 실패 시 기기 홈 탭에서 북마크릿을 실행하세요."
    );
    setStatus("connecting");
    return true;
  }, []);

  const copyBookmarklet = useCallback(async () => {
    const js = buildMinerBookmarklet(clientIdRef.current || "default");
    try {
      await navigator.clipboard.writeText(js);
      setError(
        "연동코드 복사됨 → 기기 홈 탭 주소창에 붙여넣고 Enter (주소창에 IP 연 그 탭)"
      );
      return true;
    } catch {
      setError("복사 실패 — 아래 북마크릿 링크를 길게 눌러 북마크에 추가");
      return false;
    }
  }, []);

  // Receive live board stats from the connector / bookmarklet (postMessage)
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if ((data as { type?: string }).type !== DEVICE_MSG) return;
      const info = deviceInfoFromMessage(data);
      if (info) {
        applyOk(info);
        return;
      }
      const err = (data as { ok?: boolean; error?: string }).error;
      if (err) {
        setNeedBookmarklet(true);
        setError(String(err));
        setStatus("offline");
      }
      if ((data as { needBookmarklet?: boolean }).needBookmarklet) {
        setNeedBookmarklet(true);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [enabled, applyOk]);

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

        // HTTPS site cannot fetch private HTTP IP (mixed content).
        // Launch connector window = same idea as typing IP in the address bar.
        if (!isAuto && isMixedContentBlockLikely(primary)) {
          const opened = launchConnector(primary);
          lastErr =
            lastErr ||
            "브라우저가 HTTPS→HTTP 기기 직접 읽기를 막음 → 연동 창으로 연결 시도 중";
          if (opened) {
            setStatus("connecting");
            setError(lastErr);
            // Wait for postMessage from connector — do not mark hard fail yet
            return lastGood.current;
          }
        } else if (isCloudHostedPage()) {
          lastErr =
            lastErr ||
            "보드 미연결 · 같은 Wi‑Fi에서 LAN IP 입력 후 연결(연동 창) · 또는 공개 HTTPS 터널";
        }

        return applyFail(primary, lastErr || "기기 연결 실패");
      } finally {
        busy.current = false;
      }
    },
    [applyFail, applyOk, launchConnector]
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
      setNeedConnectorClick(false);
      busy.current = false;
      setIp(v);

      // Fast path: on HTTPS + private LAN IP, open connector immediately
      // (address-bar style access) while also racing normal paths.
      if (v !== "auto" && isMixedContentBlockLikely(v)) {
        launchConnector(v);
      }

      const result = await fetchDevice(v, true);
      if (result && (result.hashRateGhs > 0 || result.online)) return result;

      // Still offline after races — ensure connector is open for LAN
      if (v !== "auto" && isMixedContentBlockLikely(v) && !lastGood.current) {
        launchConnector(v);
      }
      return result;
    },
    [setIp, fetchDevice, launchConnector]
  );

  const openConnectorManual = useCallback(() => {
    const host =
      connectorIp ||
      (ipRef.current && ipRef.current !== "auto" ? ipRef.current : "");
    if (!host) {
      setError("먼저 기기 IP를 입력하세요");
      return;
    }
    const ok = launchConnector(host);
    if (!ok) {
      downloadDeviceConnector({
        ip: host,
        clientId: clientIdRef.current || "default",
      });
      setError(
        "연동 HTML 다운로드됨 · 파일 열어두면 보드→소스엔진 연동됩니다"
      );
    }
  }, [connectorIp, launchConnector]);

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
    needConnectorClick,
    needBookmarklet,
    connectorIp,
    openConnectorManual,
    copyBookmarklet,
    bookmarkletHref: buildMinerBookmarklet(clientId || "default"),
    openMinerHome: () => {
      const host =
        connectorIp ||
        (ipRef.current && ipRef.current !== "auto" ? ipRef.current : "");
      if (host) openMinerHome(host);
    },
    launchConnector,
    refresh: () => {
      busy.current = false;
      // Prefer remembered IP; don't force auto on cloud (that kills LAN path)
      return fetchDevice(undefined, true);
    },
    connect,
    scanLan,
    hasLiveHashrate: !!(device?.online && (liveHs > 0 || liveGhs > 0)),
    // Treat connector stream as live even if ghs briefly 0 but online+temp
    isLivePoll: !!(device?.live && device?.online),
    isCloud: typeof window !== "undefined" ? isCloudHostedPage() : false,
  };
}
