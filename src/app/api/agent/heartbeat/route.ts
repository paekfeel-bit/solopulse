import { NextRequest, NextResponse } from "next/server";
import {
  putHeartbeat,
  verifyAgentKey,
  getSnapshot,
} from "@/lib/agentStore";
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

  let body: Partial<AgentHeartbeat>;
  try {
    body = (await req.json()) as Partial<AgentHeartbeat>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

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
  await putHeartbeat(hb);
  return NextResponse.json({ ok: true, snapshot: await getSnapshot() });
}

export async function GET() {
  return NextResponse.json(await getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
