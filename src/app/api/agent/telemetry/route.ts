import { NextRequest, NextResponse } from "next/server";
import {
  putTelemetry,
  verifyAgentKey,
  getSnapshot,
} from "@/lib/agentStore";
import type { MinerTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Local Agent → Cloud ingest
 * POST /api/agent/telemetry
 * Header: x-agent-key: <SOLOPULSE_AGENT_KEY>
 */
export async function POST(req: NextRequest) {
  const key =
    req.headers.get("x-agent-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!verifyAgentKey(key)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized agent key" },
      { status: 401 }
    );
  }

  let body: Partial<MinerTelemetry>;
  try {
    body = (await req.json()) as Partial<MinerTelemetry>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const ghs = Number(body.hashRateGhs) || 0;
  const tel: MinerTelemetry = {
    schemaVersion: 1,
    deviceId: String(body.deviceId || body.hostIp || "device"),
    deviceModel: String(body.deviceModel || "AxeOS miner"),
    hostIp: String(body.hostIp || ""),
    hashRateGhs: ghs,
    hashRateHs: Number(body.hashRateHs) || ghs * 1e9,
    windows: {
      instantGhs: Number(body.windows?.instantGhs) || ghs,
      m1Ghs: Number(body.windows?.m1Ghs) || ghs,
      m10Ghs: Number(body.windows?.m10Ghs) || ghs,
      h1Ghs: Number(body.windows?.h1Ghs) || ghs,
      d1Ghs: Number(body.windows?.d1Ghs) || ghs,
    },
    tempC:
      body.tempC != null && Number.isFinite(Number(body.tempC))
        ? Number(body.tempC)
        : null,
    powerW:
      body.powerW != null && Number.isFinite(Number(body.powerW))
        ? Number(body.powerW)
        : null,
    fanRpm:
      body.fanRpm != null && Number.isFinite(Number(body.fanRpm))
        ? Number(body.fanRpm)
        : null,
    bestDiff: Number(body.bestDiff) || 0,
    bestSessionDiff: Number(body.bestSessionDiff) || 0,
    networkDifficulty: Number(body.networkDifficulty) || 0,
    sharesAccepted: Number(body.sharesAccepted) || 0,
    sharesRejected: Number(body.sharesRejected) || 0,
    foundBlocks: Number(body.foundBlocks) || 0,
    totalFoundBlocks: Number(body.totalFoundBlocks) || 0,
    uptimeSec:
      body.uptimeSec != null && Number.isFinite(Number(body.uptimeSec))
        ? Number(body.uptimeSec)
        : null,
    firmware: body.firmware != null ? String(body.firmware) : null,
    collectedAt: Number(body.collectedAt) || Date.now(),
    agentId: String(body.agentId || "local-agent"),
    agentStatus: body.agentStatus || "STREAMING",
    source: body.source || "axeos",
  };

  await putTelemetry(tel);
  return NextResponse.json({
    ok: true,
    receivedAt: Date.now(),
    snapshot: await getSnapshot(),
  });
}

export async function GET() {
  return NextResponse.json(await getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
