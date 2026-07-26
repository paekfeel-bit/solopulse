import { NextRequest, NextResponse } from "next/server";
import {
  fetchDeviceDirect,
  isPrivateIPv4,
  parseDeviceTarget,
} from "@/lib/deviceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function envMinerTunnel(): string | null {
  const raw = (
    process.env.DEVICE_TUNNEL_URL ||
    process.env.MINER_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_DEVICE_TUNNEL ||
    ""
  ).trim();
  if (!raw) return null;
  return parseDeviceTarget(raw) ? raw : null;
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
    for (const c of [0, 1]) {
      for (const d of [1, 10, 50, 99, 100, 200]) {
        ips.push(`192.168.${c}.${d}`);
      }
    }
  }
  // Prioritize common / last-known ends
  const prefer = [99, 67, 66, 97, 10, 1, 100, 50, 20];
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

/**
 * GET /api/device/scan?hint=172.30.1.50
 * Home LAN: finds AxeOS. Netlify: uses DEVICE_TUNNEL_URL if set.
 */
export async function GET(req: NextRequest) {
  const hint = (req.nextUrl.searchParams.get("hint") || "").trim();
  const tunnel = envMinerTunnel();

  // Cloud path: probe tunnel first (no LAN access)
  if (tunnel) {
    const r = await fetchDeviceDirect(tunnel, 8000);
    if (r.ok) {
      return NextResponse.json(
        {
          found: [
            {
              ip: r.info.ip || tunnel,
              deviceModel: r.info.deviceModel,
              hashRateGhs: r.info.hashRateGhs,
              temp: r.info.temp,
              via: "tunnel",
            },
          ],
          openPort80: [],
          scanned: 1,
          hint: hint || null,
          note: "채굴기 터널(DEVICE_TUNNEL_URL)로 연결됨",
          cloud: true,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const candidates = expandCandidates(hint || "172.30.1.99");
  const list = candidates.slice(0, 260);
  const openHosts: string[] = [];

  const batch = 40;
  for (let i = 0; i < list.length; i += batch) {
    const chunk = list.slice(i, i + batch);
    const flags = await Promise.all(
      chunk.map(async (ip) => ((await tcpOpen(ip, 80, 200)) ? ip : null))
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
    const r = await fetchDeviceDirect(ip, 2500);
    if (!r.ok) continue;
    found.push({
      ip: r.info.ip,
      deviceModel: r.info.deviceModel,
      hashRateGhs: r.info.hashRateGhs,
      temp: r.info.temp,
    });
    if (found.length >= 5) break;
  }

  // If nothing on LAN and we had a tunnel that failed, say so
  const onCloudLikely = openHosts.length === 0 && found.length === 0;

  return NextResponse.json(
    {
      found,
      openPort80: openHosts,
      scanned: list.length,
      hint: hint || null,
      cloud: onCloudLikely,
      note:
        found.length === 0
          ? onCloudLikely
            ? tunnel
              ? "터널 응답 없음. 집 PC에서 start-miner-tunnel.bat 재실행 후 Netlify env DEVICE_TUNNEL_URL 을 새 URL로 업데이트하세요."
              : "Netlify/클라우드에서는 LAN 자동검색이 불가합니다. ① 집 PC: start-miner-tunnel.bat ② 나온 https://….trycloudflare.com 을 기기 칸에 입력 ③ 또는 같은 Wi‑Fi에서 로컬 서버(start-solopulse.bat) 사용"
            : openHosts.length === 0
              ? "같은 Wi‑Fi에서 포트 80 장비를 못 찾았습니다. 채굴기 전원/AP isolation·AxeOS IP 확인."
              : `포트 80 장비 ${openHosts.length}대 발견했으나 AxeOS API가 아닙니다: ${openHosts.slice(0, 8).join(", ")}`
          : `AxeOS ${found.length}대 발견`,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
