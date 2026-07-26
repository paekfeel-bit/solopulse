import { NextRequest, NextResponse } from "next/server";
import {
  fetchDeviceDirect,
  isPrivateIPv4,
  parseDeviceTarget,
} from "@/lib/deviceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Optional permanent miner tunnel (Netlify env) — used when LAN IP is unreachable from cloud */
function envMinerTunnel(): string | null {
  const raw = (
    process.env.DEVICE_TUNNEL_URL ||
    process.env.MINER_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_DEVICE_TUNNEL ||
    ""
  ).trim();
  if (!raw) return null;
  const t = parseDeviceTarget(raw);
  return t && !t.privateLan ? raw : null;
}

/**
 * Proxy AxeOS miner (LAN IP or HTTPS tunnel URL).
 * GET /api/device?ip=172.30.1.99
 * GET /api/device?ip=https://xxx.trycloudflare.com
 *
 * On Netlify: private LAN fails → if DEVICE_TUNNEL_URL is set, retry via tunnel.
 */
export async function GET(req: NextRequest) {
  const rawIp = (req.nextUrl.searchParams.get("ip") || "").trim();
  if (!rawIp) {
    return NextResponse.json(
      { online: false, error: "No device IP" },
      { status: 400 }
    );
  }

  const target = parseDeviceTarget(rawIp);
  if (!target) {
    return NextResponse.json(
      {
        online: false,
        error:
          "Host not allowed (SSRF guard). Use LAN IP (192.168/172.16-31/10.x), *.local, or https://…trycloudflare.com tunnel to miner.",
      },
      { status: 400 }
    );
  }

  const tryHosts: string[] = [rawIp];
  const tunnel = envMinerTunnel();
  // Cloud cannot open private LAN — fall back to site-configured miner tunnel
  if (target.privateLan && tunnel) {
    const same =
      parseDeviceTarget(tunnel)?.displayHost === target.displayHost;
    if (!same) tryHosts.push(tunnel);
  }

  let lastError = "device unreachable";
  let usedHost = rawIp;

  for (const host of tryHosts) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await fetchDeviceDirect(host, 6000 + attempt * 1500);
      if (result.ok) {
        const viaTunnel = host !== rawIp;
        return NextResponse.json(
          {
            ...result.info,
            via: "proxy",
            privateLan: target.privateLan,
            requestedIp: target.displayHost,
            tunnelFallback: viaTunnel,
            ip: viaTunnel
              ? target.displayHost
              : result.info.ip || target.displayHost,
          },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      }
      lastError = result.error;
      usedHost = host;
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }

  const isLan = target.privateLan || isPrivateIPv4(target.hostOnly);
  return NextResponse.json(
    {
      online: false,
      ip: target.displayHost,
      privateLan: isLan,
      error: lastError,
      triedTunnel: Boolean(tunnel && isLan),
      lastHost: usedHost,
      hint: isLan
        ? tunnel
          ? "LAN + tunnel both failed. Restart start-miner-tunnel.bat on home PC and update Netlify DEVICE_TUNNEL_URL if the trycloudflare URL changed."
          : "Netlify/cloud cannot open 172.x/192.168.x. On home PC run start-miner-tunnel.bat, paste https://….trycloudflare.com into device field — or set site env DEVICE_TUNNEL_URL."
        : "Check the tunnel is still running and points at the miner HTTP port.",
    },
    { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
