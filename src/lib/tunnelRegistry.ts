/**
 * Live miner tunnel discovery via public JSONBlob registry.
 * Home device-bridge publishes { tunnel, minerIp, updatedAt } here.
 * Vercel reads it on every connect — no redeploy when tunnel URL changes.
 */

export const TUNNEL_REGISTRY_URL = (
  process.env.TUNNEL_REGISTRY_URL ||
  process.env.NEXT_PUBLIC_TUNNEL_REGISTRY ||
  "https://jsonblob.com/api/jsonBlob/019f9eef-8d49-74f0-8ae5-6de62414b41b"
).trim();

export type TunnelRegistry = {
  tunnel?: string;
  minerIp?: string;
  updatedAt?: string;
  app?: string;
};

export async function fetchPublishedTunnel(
  timeoutMs = 6000
): Promise<TunnelRegistry | null> {
  try {
    const res = await fetch(TUNNEL_REGISTRY_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as TunnelRegistry;
    if (!j || typeof j !== "object") return null;
    // Ignore stale entries older than 30 minutes
    if (j.updatedAt) {
      const age = Date.now() - Date.parse(j.updatedAt);
      if (Number.isFinite(age) && age > 30 * 60 * 1000) {
        return { ...j, tunnel: j.tunnel }; // still try — better than nothing
      }
    }
    return j;
  } catch {
    return null;
  }
}

export function normalizeTunnelUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\/$/, "");
  if (!s) return null;
  if (/^https:\/\/[a-z0-9.-]+\.trycloudflare\.com$/i.test(s)) return s;
  if (/^[a-z0-9.-]+\.trycloudflare\.com$/i.test(s)) return `https://${s}`;
  if (/^https:\/\//i.test(s)) return s;
  return null;
}
