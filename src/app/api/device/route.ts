import { NextRequest, NextResponse } from "next/server";
import { fetchDeviceDirect, parseDeviceTarget } from "@/lib/deviceClient";
import {
  fetchPublishedTunnel,
  normalizeTunnelUrl,
} from "@/lib/tunnelRegistry";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function envMinerTunnel(): string | null {
  return normalizeTunnelUrl(
    process.env.DEVICE_TUNNEL_URL ||
      process.env.MINER_TUNNEL_URL ||
      process.env.NEXT_PUBLIC_DEVICE_TUNNEL ||
      ""
  );
}

/**
 * Resolve public tunnel to miner/bridge:
 * 1) live registry (device-bridge publishes)
 * 2) Vercel env
 */
async function resolvePublicTunnel(): Promise<string | null> {
  const reg = await fetchPublishedTunnel(5000);
  const fromReg = normalizeTunnelUrl(reg?.tunnel);
  if (fromReg) return fromReg;
  return envMinerTunnel();
}

export async function GET(req: NextRequest) {
  const rawIp = (req.nextUrl.searchParams.get("ip") || "").trim();
  if (!rawIp) {
    return NextResponse.json(
      { online: false, error: "No device IP" },
      { status: 400 }
    );
  }

  // Special: ip=auto → registry tunnel only
  const isAuto = rawIp.toLowerCase() === "auto" || rawIp.toLowerCase() === "bridge";

  const target = isAuto ? null : parseDeviceTarget(rawIp);
  if (!isAuto && !target) {
    return NextResponse.json(
      {
        online: false,
        error:
          "허용되지 않는 주소. LAN IP 또는 https://….trycloudflare.com 또는 ip=auto",
      },
      { status: 400 }
    );
  }

  const publicTunnel = await resolvePublicTunnel();
  const tryHosts: string[] = [];

  if (isAuto) {
    if (publicTunnel) tryHosts.push(publicTunnel);
  } else if (target!.privateLan) {
    // Cloud cannot open LAN — tunnel FIRST (registry live URL)
    if (publicTunnel) tryHosts.push(publicTunnel);
    tryHosts.push(rawIp);
  } else {
    tryHosts.push(rawIp);
    if (publicTunnel && publicTunnel !== rawIp.replace(/\/$/, "")) {
      tryHosts.push(publicTunnel);
    }
  }

  const seen = new Set<string>();
  const hosts = tryHosts.filter((h) => {
    const k = h.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (hosts.length === 0) {
    return NextResponse.json(
      {
        online: false,
        error: "공개 터널 없음",
        hint: "집 PC에서 start-device-bridge.bat 를 실행하세요. 터널이 자동 등록됩니다.",
        privateLan: true,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  let lastError = "device unreachable";
  let usedHost = hosts[0];

  for (const host of hosts) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await fetchDeviceDirect(host, 6000 + attempt * 1500);
      if (result.ok) {
        const displayIp =
          target?.privateLan || isAuto
            ? target?.displayHost ||
              result.info.ip ||
              "LAN"
            : result.info.ip || target?.displayHost || host;
        return NextResponse.json(
          {
            ...result.info,
            via: "proxy",
            privateLan: Boolean(target?.privateLan || isAuto),
            requestedIp: isAuto ? "auto" : target!.displayHost,
            tunnelFallback: host === publicTunnel,
            publicTunnel: publicTunnel || null,
            ip: displayIp,
          },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      }
      lastError = result.error;
      usedHost = host;
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }

  const isLan = Boolean(target?.privateLan || isAuto);
  return NextResponse.json(
    {
      online: false,
      ip: target?.displayHost || "auto",
      privateLan: isLan,
      error: lastError,
      triedTunnel: Boolean(publicTunnel),
      publicTunnel: publicTunnel || null,
      lastHost: usedHost,
      hint: isLan
        ? publicTunnel
          ? "터널은 등록돼 있으나 응답 없음. 집 PC start-device-bridge.bat 이 실행 중인지 확인하세요."
          : "집 PC에서 start-device-bridge.bat 을 실행하세요 (채굴기 자동 검색 + 터널 자동 등록)."
        : "터널 URL이 만료됐을 수 있습니다. start-device-bridge.bat 재실행.",
    },
    { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
