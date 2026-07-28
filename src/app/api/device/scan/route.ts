import { NextRequest, NextResponse } from "next/server";
import {
  fetchDeviceDirect,
  isPrivateIPv4,
  parseDeviceTarget,
} from "@/lib/deviceClient";
import {
  fetchPublishedTunnel,
  normalizeTunnelUrl,
} from "@/lib/tunnelRegistry";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function resolvePublicTunnel(): Promise<string | null> {
  const reg = await fetchPublishedTunnel(5000);
  const fromReg = normalizeTunnelUrl(reg?.tunnel);
  if (fromReg) return fromReg;
  return normalizeTunnelUrl(
    process.env.DEVICE_TUNNEL_URL ||
      process.env.MINER_TUNNEL_URL ||
      process.env.NEXT_PUBLIC_DEVICE_TUNNEL ||
      ""
  );
}

async function tcpOpen(host: string, port: number, ms: number): Promise<boolean> {
  try {
    const net = await import("node:net");
    return await new Promise((resolve) => {
      const s = net.createConnection({ host, port }, () => {
        s.destroy();
        resolve(true);
      });
      s.setTimeout(ms, () => {
        s.destroy();
        resolve(false);
      });
      s.on("error", () => {
        s.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

function expandCandidates(hint: string): string[] {
  const ips: string[] = [];
  const addSubnet = (a: number, b: number, c: number) => {
    for (let d = 1; d <= 254; d++) ips.push(`${a}.${b}.${c}.${d}`);
  };
  const t = hint ? parseDeviceTarget(hint) : null;
  if (t && isPrivateIPv4(t.hostOnly)) {
    const [a, b, c] = t.hostOnly.split(".").map(Number);
    addSubnet(a, b, c);
  } else {
    addSubnet(172, 30, 1);
  }
  const prefer = [16, 8, 99, 67, 66, 97, 10, 1, 100, 50];
  ips.sort((x, y) => {
    const dx = Number(x.split(".").pop());
    const dy = Number(y.split(".").pop());
    const px = prefer.indexOf(dx);
    const py = prefer.indexOf(dy);
    if (px === -1 && py === -1) return dx - dy;
    if (px === -1) return 1;
    if (py === -1) return -1;
    return px - py;
  });
  return [...new Set(ips)];
}

export async function GET(req: NextRequest) {
  const hint = (req.nextUrl.searchParams.get("hint") || "").trim();
  const reg = await fetchPublishedTunnel(5000);
  const tunnel = normalizeTunnelUrl(reg?.tunnel) || (await resolvePublicTunnel());

  // Cloud path: registry tunnel
  if (tunnel) {
    const r = await fetchDeviceDirect(tunnel, 12000);
    if (r.ok) {
      const lanIp =
        (reg?.minerIp && isPrivateIPv4(reg.minerIp) && reg.minerIp) ||
        (hint && parseDeviceTarget(hint)?.privateLan
          ? parseDeviceTarget(hint)!.displayHost
          : r.info.ip);
      return NextResponse.json(
        {
          found: [
            {
              ip: lanIp,
              connectIp: "auto",
              deviceModel: r.info.deviceModel,
              hashRateGhs: r.info.hashRateGhs,
              temp: r.info.temp,
              via: "registry-tunnel",
            },
          ],
          openPort80: [],
          scanned: 1,
          hint: hint || null,
          note: `브리지 터널 연결됨 · 채굴기 ${lanIp || "?"} · ${r.info.hashRateGhs.toFixed(0)} GH/s`,
          cloud: true,
          tunnel,
          minerIp: reg?.minerIp || null,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // Home LAN scan (only works when API runs on home network)
  const candidates = expandCandidates(hint || "172.30.1.16");
  const list = candidates.slice(0, 260);
  const openHosts: string[] = [];
  for (let i = 0; i < list.length; i += 48) {
    const chunk = list.slice(i, i + 48);
    const flags = await Promise.all(
      chunk.map(async (ip) => ((await tcpOpen(ip, 80, 180)) ? ip : null))
    );
    for (const ip of flags) if (ip) openHosts.push(ip);
  }

  const found: Array<{
    ip: string;
    deviceModel: string;
    hashRateGhs: number;
    temp: number | null;
  }> = [];

  for (const ip of openHosts) {
    const r = await fetchDeviceDirect(ip, 2200);
    if (!r.ok) continue;
    found.push({
      ip: r.info.ip,
      deviceModel: r.info.deviceModel,
      hashRateGhs: r.info.hashRateGhs,
      temp: r.info.temp,
    });
    if (found.length >= 5) break;
  }

  const onCloud = openHosts.length === 0 && found.length === 0;

  return NextResponse.json(
    {
      found,
      openPort80: openHosts,
      scanned: list.length,
      hint: hint || null,
      cloud: onCloud,
      tunnel: tunnel || null,
      note:
        found.length === 0
          ? onCloud
            ? tunnel
              ? "터널 등록은 있으나 응답 없음. 집 PC start-device-bridge.bat 재실행."
              : "집 PC에서 start-device-bridge.bat 을 실행하세요. (채굴기 자동 검색 + 터널 자동 등록 — IP가 바뀌어도 동작)"
            : openHosts.length === 0
              ? "LAN에서 장비를 못 찾았습니다."
              : `포트 80 ${openHosts.length}대, AxeOS 아님`
          : `AxeOS ${found.length}대 발견`,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
