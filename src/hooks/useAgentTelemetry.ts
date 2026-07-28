"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSnapshot, MinerTelemetry } from "@/lib/telemetry";

const POLL_MS = 2_500;

function wsUrl(clientId: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const id = encodeURIComponent(clientId || "default");
  return `${proto}//${window.location.host}/ws?role=browser&clientId=${id}`;
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
      m1Ghs: ghs,
      m10Ghs: ghs,
      h1Ghs: ghs,
      d1Ghs: ghs,
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
 * Primary device path:
 * 1) WebSocket live packets from Local Bridge
 * 2) HTTP poll /api/agent/telemetry (Agent POST / bridge dual-write)
 */
export function useAgentTelemetry(enabled = true, clientId = "default") {
  const [snap, setSnap] = useState<AgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const applyTel = useCallback((t: MinerTelemetry) => {
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
      const res = await fetch(`/api/agent/telemetry?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`agent API HTTP ${res.status}`);
        return null;
      }
      const j = (await res.json()) as AgentSnapshot;
      // Don't overwrite fresher WS data with stale HTTP empty
      setSnap((prev) => {
        if (
          prev?.telemetry &&
          j.telemetry &&
          (j.telemetry.collectedAt || 0) < (prev.telemetry.collectedAt || 0)
        ) {
          return prev;
        }
        if (!j.telemetry && prev?.telemetry && prev.staleMs < 30_000) {
          return prev;
        }
        return j;
      });
      setError(null);
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "agent fetch failed");
      return null;
    }
  }, []);

  // HTTP poll fallback
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  // WebSocket live
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        const url = wsUrl(clientId);
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "subscribe", clientId }));
        };
        ws.onmessage = (ev) => {
          try {
            const p = JSON.parse(String(ev.data));
            if (p.type === "miner_data" && p.data) {
              applyTel(telFromWs(p.data as Record<string, unknown>, clientId));
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
          if (!closed) retry = setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* */
          }
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 4000);
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
  }, [enabled, clientId, applyTel]);

  const t: MinerTelemetry | null = snap?.telemetry ?? null;
  const agentOnline = !!snap?.agentOnline;
  const ghs = Number(t?.hashRateGhs) || 0;
  const fresh =
    !!t &&
    (!!snap?.online ||
      (t.collectedAt > 0 && Date.now() - t.collectedAt < 60_000));
  const deviceOnline = fresh && !!t;

  return {
    snap,
    telemetry: t,
    error,
    refresh,
    agentOnline: agentOnline || fresh,
    agentStatus: snap?.agentStatus || (fresh ? "STREAMING" : "AGENT_OFFLINE"),
    deviceOnline,
    hasLiveHashrate: deviceOnline && ghs > 0,
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
    staleMs: snap?.staleMs ?? 999_999,
    collectedAt: t?.collectedAt || 0,
  };
}
