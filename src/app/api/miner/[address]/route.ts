import { NextRequest, NextResponse } from "next/server";
import type { CkUserStats, CkWorker } from "@/lib/types";
import { getPoolOption } from "@/lib/pools";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CK_POOLS = [
  "solo.ckpool.org",
  "eusolo.ckpool.org",
  "ausolo.ckpool.org",
  "sgsolo.ckpool.org",
] as const;

function formatHs(hs: number): string {
  if (!Number.isFinite(hs) || hs <= 0) return "0";
  if (hs >= 1e15) return `${(hs / 1e15).toFixed(2)}P`;
  if (hs >= 1e12) return `${(hs / 1e12).toFixed(2)}T`;
  if (hs >= 1e9) return `${(hs / 1e9).toFixed(2)}G`;
  if (hs >= 1e6) return `${(hs / 1e6).toFixed(2)}M`;
  return `${hs.toFixed(0)}`;
}

function sanitizeUser(data: Record<string, unknown>): CkUserStats {
  const workerRaw = Array.isArray(data.worker) ? data.worker : [];
  const worker: CkWorker[] = workerRaw.map((w: Record<string, unknown>) => ({
    workername: String(w.workername || w.name || "worker"),
    hashrate1m: String(w.hashrate1m ?? "0"),
    hashrate5m: String(w.hashrate5m ?? w.hashrate1m ?? "0"),
    hashrate1hr: String(w.hashrate1hr ?? "0"),
    hashrate1d: String(w.hashrate1d ?? "0"),
    hashrate7d: String(w.hashrate7d ?? "0"),
    lastshare: Number(w.lastshare) || 0,
    shares: Number(w.shares) || 0,
    bestshare: Number(w.bestshare) || 0,
    bestever: Number(w.bestever || w.bestshare) || 0,
  }));

  return {
    hashrate1m: String(data.hashrate1m ?? "0"),
    hashrate5m: String(data.hashrate5m ?? data.hashrate1m ?? "0"),
    hashrate1hr: String(data.hashrate1hr ?? "0"),
    hashrate1d: String(data.hashrate1d ?? "0"),
    hashrate7d: String(data.hashrate7d ?? "0"),
    lastshare: Number(data.lastshare) || 0,
    workers: Number(data.workers ?? worker.length) || 0,
    shares: Number(data.shares) || 0,
    bestshare: Number(data.bestshare) || 0,
    bestever: Number(data.bestever || data.bestshare) || 0,
    authorised: Number(data.authorised) || Number(data.lastshare) || 0,
    worker,
  };
}

async function fetchCkUser(host: string, address: string) {
  const url = `https://${host}/users/${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*" },
    // Prefer preferred host under 2s poll budget; fail fast to next region
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
  const text = await res.text();
  // Empty / "not found" style
  if (!text || text.trim().length < 2) throw new Error(`${host} empty`);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Invalid JSON from pool");
  }
}

function isUsefulUser(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // Any of these means the address was seen by the pool
  if (d.hashrate1m != null || d.hashrate5m != null || d.workers != null) return true;
  if (d.lastshare != null || d.shares != null || d.bestshare != null) return true;
  if (Array.isArray(d.worker) && d.worker.length > 0) return true;
  return false;
}

async function fetchPublicPool(address: string): Promise<{ pool: string; user: CkUserStats }> {
  const url = `https://public-pool.io:40557/api/client/${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`public-pool HTTP ${res.status}`);
  const data = await res.json();

  const acc = data.accounting || {};
  const hr10 = Number(acc.hashRateLast10Minutes || 0);
  const hr1h = Number(acc.hashRateLastHour || 0);
  const best = Number(data.bestDifficulty || acc.bestSubmissionDifficulty || 0);
  const workersArr = Array.isArray(data.workers) ? data.workers : [];
  const workersCount = Number(data.workersCount ?? workersArr.length ?? 0);

  const lastShareRaw = acc.latestShareAt;
  let lastshare = 0;
  if (typeof lastShareRaw === "string") {
    lastshare = Math.floor(new Date(lastShareRaw).getTime() / 1000) || 0;
  } else if (typeof lastShareRaw === "number") {
    lastshare = lastShareRaw > 1e12 ? Math.floor(lastShareRaw / 1000) : lastShareRaw;
  }

  const worker: CkWorker[] = workersArr.map(
    (w: {
      name?: string;
      sessionId?: string;
      hashrate?: number;
      bestDifficulty?: number;
      lastSeen?: string | number;
    }) => {
      const wh = Number(w.hashrate || hr10 || 0);
      let ls = lastshare;
      if (w.lastSeen) {
        ls =
          typeof w.lastSeen === "number"
            ? w.lastSeen > 1e12
              ? Math.floor(w.lastSeen / 1000)
              : w.lastSeen
            : Math.floor(new Date(String(w.lastSeen)).getTime() / 1000) || 0;
      }
      return {
        workername: w.name || w.sessionId || address,
        hashrate1m: formatHs(wh),
        hashrate5m: formatHs(wh),
        hashrate1hr: formatHs(wh),
        hashrate1d: formatHs(wh),
        hashrate7d: formatHs(wh),
        lastshare: ls,
        shares: Number(acc.totalAcceptedShares || 0),
        bestshare: Number(w.bestDifficulty || best || 0),
        bestever: Number(w.bestDifficulty || best || 0),
      };
    }
  );

  if (workersCount === 0 && hr10 === 0 && hr1h === 0 && best === 0 && !lastshare) {
    throw new Error("No stats on public-pool");
  }

  const user: CkUserStats = {
    hashrate1m: formatHs(hr10),
    hashrate5m: formatHs(hr10),
    hashrate1hr: formatHs(hr1h || hr10),
    hashrate1d: formatHs(hr1h || hr10),
    hashrate7d: formatHs(hr1h || hr10),
    lastshare,
    workers: workersCount,
    shares: Number(acc.totalAcceptedShares || 0),
    bestshare: best,
    bestever: best,
    authorised: lastshare,
    worker,
  };

  return { pool: "public-pool.io", user };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  // Strip worker suffix / URL noise if client sent full stratum user
  let addr = decodeURIComponent(address).trim().replace(/\s+/g, "");
  const dot = addr.indexOf(".");
  if (dot > 14 && (/^(bc1|tb1)/i.test(addr) || /^[13]/.test(addr))) {
    addr = addr.slice(0, dot);
  }
  const usersIdx = addr.toLowerCase().lastIndexOf("/users/");
  if (usersIdx >= 0) addr = addr.slice(usersIdx + "/users/".length);
  addr = addr.split("?")[0].split("#")[0];

  if (!addr || addr.length < 14) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const preferred = req.nextUrl.searchParams.get("pool") || "solo.ckpool.org";
  const opt = getPoolOption(preferred);
  const errors: string[] = [];

  try {
    // Preferred public pool first if selected
    if (opt.kind === "publicpool") {
      try {
        const { pool, user } = await fetchPublicPool(addr);
        return NextResponse.json(
          { pool, user, fetchedAt: Date.now() },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        // fall through to CK regions
      }
    }

    const order = [
      preferred,
      ...CK_POOLS.filter((p) => p !== preferred),
    ].filter((p) => p !== "public-pool.io");

    for (const host of order) {
      if (getPoolOption(host).kind === "publicpool") continue;
      try {
        const data = await fetchCkUser(host, addr);
        if (!isUsefulUser(data)) {
          errors.push(`No stats on ${host}`);
          continue;
        }
        const user = sanitizeUser(data as Record<string, unknown>);
        return NextResponse.json(
          { pool: host, user, fetchedAt: Date.now() },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    // Last resort: public pool if not already tried
    if (opt.kind !== "publicpool") {
      try {
        const { pool, user } = await fetchPublicPool(addr);
        return NextResponse.json(
          { pool, user, fetchedAt: Date.now() },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json(
      {
        error: `Miner not found on CKPool / Public Pool. ${errors.slice(0, 3).join(" · ")}`,
      },
      { status: 404 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Miner fetch failed" },
      { status: 404 }
    );
  }
}
