"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSnapshot, MinerTelemetry } from "@/lib/telemetry";

/** Fast poll — board hashrate must feel real-time */
const POLL_MS = 1_500;
const FRESH_MS = 90_000;

function wsUrl(clientId: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const id = encodeURIComponent(clientId || "default");
  return `${proto}//${window.location.host}/ws?role=browser&clientId=${id}`;
}

function normalizeClientId(id: string) {
  return (id || "default").trim().replace(/\s+/g, "") || "default";
}

function telFromWs(data: Record<string, unknown>, clientId: string): MinerTelemetry {
  const ghsRaw = Number(data.hashrate ?? data.hashRateGhs ?? data.hashRate) || 0;
  const ghs = ghsRaw >= 1e11 ? ghsRaw / 1e9 : ghsRaw;
  return {
    schemaVersion: 1,
    deviceId: String(data.deviceId || data.hostIp || clientId),
    deviceModel: String(data.deviceModel || "NerdQAxe"),
    hostIp: String(data.hostIp || data.ip || ""),
    hashRateGhs: ghs,
    hashRateHs: ghs * 1e9,
    windows: {
      instantGhs: ghs,
      m1Ghs: Number(data.hashrate1m || ghs) || ghs,
      m10Ghs: Number(data.hashrate10m || ghs) || ghs,
      h1Ghs: Number(data.hashrate1h || ghs) || ghs,
      d1Ghs: Number(data.hashrate1d || ghs) || ghs,
    },
    tempC: data.temp != null || data.tempC != null ? Number(data.temp ?? data.tempC) : null,
    powerW:
      data.power != null || data.powerW != null
        ? Number(data.power ?? data.powerW)
        : null,
    fanRpm: data.fanRpm != null ? Number(data.fanRpm) : null,
    bestDiff: Number(data.bestshare ?? data.bestDiff) || 0,
    bestSessionDiff: Number(data.bestSessionDiff) || 0,
    networkDifficulty: Number(data.networkDifficulty) || 0,
    sharesAccepted: Number(data.sharesAccepted) || 0,
    sharesRejected: Number(data.sharesRejected) || 0,
    foundBlocks: Number(data.foundBlocks) || 0,
    totalFoundBlocks: Number(data.totalFoundBlocks) || 0,
    uptimeSec: data.uptime != null ? Number(data.uptime) : null,
    firmware: data.firmware != null ? String(data.firmware) : null,
    collectedAt: Number(data.timestamp) || Date.now(),
    agentId: "ws-bridge",
    agentStatus: "STREAMING",
    source: "axeos",
  };
}

/**
 * Ground-truth board path:
 * 1) WebSocket live from Local Bridge (all tabs)
 * 2) HTTP /api/agent/telemetry (clientId + default)
 */
export function useAgentTelemetry(enabled = true, clientId = "default") {
  const cid = normalizeClientId(clientId);
  const [snap, setSnap] = useState<AgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastTelAt = useRef(0);

  const applyTel = useCallback((t: MinerTelemetry) => {
    if (!(t.hashRateGhs > 0) && !(t.hashRateHs > 0)) return;
    lastTelAt.current = Date.now();
    setSnap({
      online: true,
      agentOnline: true,
      agentStatus: "STREAMING",
      telemetry: t,
      heartbeat: {
        agentId: t.agentId,
        status: "STREAMING",
        version: "ws",
        devices: [t.hostIp].filter(Boolean),
        ts: Date.now(),
      },
      updatedAt: Date.now(),
      staleMs: 0,
    });
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const ids = cid === "default" ? ["default"] : [cid, "default"];
      let best: AgentSnapshot | null = null;
      for (const id of ids) {
        const q = new URLSearchParams({
          clientId: id,
          _: String(Date.now()),
        });
        const res = await fetch(`/api/agent/telemetry?${q}`, {
          cache: "no-store",
        });
        if (!res.ok) continue;
        const j = (await res.json()) as AgentSnapshot;
        const ghs = Number(j.telemetry?.hashRateGhs) || 0;
        const at = Number(j.telemetry?.collectedAt) || Number(j.updatedAt) || 0;
        if (!best) {
          best = j;
          continue;
        }
        const bg = Number(best.telemetry?.hashRateGhs) || 0;
        const bat =
          Number(best.telemetry?.collectedAt) || Number(best.updatedAt) || 0;
        if (ghs > 0 && (bg <= 0 || at >= bat)) best = j;
      }
      if (!best) {
        setError("agent API unavailable");
        return null;
      }
      const j = best;
      setSnap((prev) => {
        // Never replace fresher WS sample with older HTTP
        if (
          prev?.telemetry &&
          j.telemetry &&
          (j.telemetry.collectedAt || 0) < (prev.telemetry.collectedAt || 0)
        ) {
          return {
            ...prev,
            staleMs: Math.max(0, Date.now() - (prev.telemetry.collectedAt || 0)),
          };
        }
        if (!j.telemetry && prev?.telemetry) {
          const age = Date.now() - (prev.telemetry.collectedAt || 0);
          if (age < FRESH_MS) {
            return { ...prev, staleMs: age };
          }
        }
        if (j.telemetry && (j.telemetry.hashRateGhs || 0) > 0) {
          lastTelAt.current = j.telemetry.collectedAt || Date.now();
        }
        return j;
      });
      setError(null);
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "agent fetch failed");
      return null;
    }
  }, [cid]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        // Connect as user id; server also joins "default" channel
        const url = wsUrl(cid);
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "subscribe", clientId: cid }));
          if (cid !== "default") {
            ws.send(JSON.stringify({ type: "subscribe", clientId: "default" }));
          }
        };
        ws.onmessage = (ev) => {
          try {
            const p = JSON.parse(String(ev.data));
            if (p.type === "miner_data" && p.data) {
              applyTel(telFromWs(p.data as Record<string, unknown>, cid));
            } else if (p.type === "miner_offline") {
              setSnap((prev) =>
                prev
                  ? {
                      ...prev,
                      online: false,
                      agentStatus: "DEVICE_OFFLINE",
                      staleMs: Date.now() - (prev.updatedAt || 0),
                    }
                  : prev
              );
            }
          } catch {
            /* */
          }
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (!closed) retry = setTimeout(connect, 2000);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* */
          }
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        wsRef.current?.close();
      } catch {
        /* */
      }
    };
  }, [enabled, cid, applyTel]);

  const t: MinerTelemetry | null = snap?.telemetry ?? null;
  const ghs = Number(t?.hashRateGhs) || 0;
  const ageMs = t?.collectedAt
    ? Date.now() - t.collectedAt
    : lastTelAt.current
      ? Date.now() - lastTelAt.current
      : Number.POSITIVE_INFINITY;
  const fresh = !!t && ghs > 0 && Number.isFinite(ageMs) && ageMs < FRESH_MS;

  return {
    snap,
    telemetry: t,
    error,
    refresh,
    agentOnline: fresh || !!snap?.agentOnline,
    agentStatus: fresh
      ? "STREAMING"
      : snap?.agentStatus || "AGENT_OFFLINE",
    deviceOnline: fresh,
    /** True only when board hashrate is fresh — source engine must use this */
    hasLiveHashrate: fresh,
    hashRateGhs: ghs,
    hashRateHs: Number(t?.hashRateHs) || ghs * 1e9,
    tempC: t?.tempC ?? null,
    powerW: t?.powerW ?? null,
    deviceModel: t?.deviceModel || "",
    hostIp: t?.hostIp || "",
    windows: t?.windows || {
      instantGhs: 0,
      m1Ghs: 0,
      m10Ghs: 0,
      h1Ghs: 0,
      d1Ghs: 0,
    },
    bestDiff: t?.bestDiff || 0,
    bestSessionDiff: t?.bestSessionDiff || 0,
    sharesAccepted: t?.sharesAccepted || 0,
    sharesRejected: t?.sharesRejected || 0,
    foundBlocks: t?.foundBlocks || 0,
    staleMs: Number.isFinite(ageMs) ? ageMs : snap?.staleMs ?? 999_999,
    collectedAt: t?.collectedAt || 0,
  };
}
