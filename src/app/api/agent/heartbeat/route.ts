import { NextRequest, NextResponse } from "next/server";
import {
  putHeartbeat,
  verifyAgentKey,
  getSnapshot,
} from "@/lib/agentStore";
import { toClientId } from "@/lib/clientId";
import type { AgentHeartbeat } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const key =
    req.headers.get("x-agent-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!verifyAgentKey(key)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<AgentHeartbeat> & { clientId?: string };
  try {
    body = (await req.json()) as Partial<AgentHeartbeat> & { clientId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const clientId = toClientId(
    body.clientId ||
      req.headers.get("x-client-id") ||
      req.nextUrl.searchParams.get("clientId") ||
      "default"
  );

  const hb: AgentHeartbeat = {
    agentId: String(body.agentId || "local-agent"),
    status: body.status || "STREAMING",
    hostname: body.hostname,
    platform: body.platform,
    version: String(body.version || "1.0.0"),
    devices: Array.isArray(body.devices) ? body.devices.map(String) : [],
    ts: Date.now(),
    lastError: body.lastError ?? null,
  };
  await putHeartbeat(hb, clientId);
  return NextResponse.json({
    ok: true,
    clientId,
    snapshot: await getSnapshot(clientId),
  });
}

export async function GET(req: NextRequest) {
  const clientId = toClientId(
    req.nextUrl.searchParams.get("clientId") || "default"
  );
  return NextResponse.json(await getSnapshot(clientId), {
    headers: { "Cache-Control": "no-store" },
  });
}
