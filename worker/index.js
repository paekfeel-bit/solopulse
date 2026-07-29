/**
 * SoloPulse edge Worker — serves full app UI via origin proxy + CF API routes.
 * Full Next.js UI origin (Vercel). Realtime/API on solopulse-api.
 */
const API = "https://solopulse-api.paekfeel.workers.dev";
const UI_ORIGIN = "https://solopulse-production.up.railway.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const uiOrigin = env.UI_ORIGIN || UI_ORIGIN;
    const apiBase = env.API_BASE || API;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/health" || url.pathname === "/api/cf-health") {
      return json({
        ok: true,
        app: "SoloPulse",
        stack: "cloudflare",
        edge: "solopulse",
        ui: uiOrigin,
        api: apiBase,
      });
    }

    // Auth / bridge / durable realtime → CF API worker
    if (
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/ws") ||
      url.pathname.startsWith("/bridge/ws")
    ) {
      return proxyTo(request, apiBase, url);
    }

    // Everything else (dashboard UI + Next /api/*) → full SoloPulse origin
    return proxyUi(request, uiOrigin, url);
  },
};

async function proxyUi(request, origin, url) {
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  headers.set("host", new URL(origin).host);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // @ts-expect-error duplex for streaming body
    init.duplex = "half";
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (err) {
    return json({ ok: false, error: "UI origin unreachable", detail: String(err) }, 502);
  }

  // Follow one hop of same-origin redirects from Vercel
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      try {
        const next = new URL(loc, origin);
        if (next.origin === new URL(origin).origin) {
          const hop = await fetch(next, { method: "GET", headers, redirect: "manual" });
          return rewriteResponse(hop, url.origin, origin);
        }
      } catch {
        /* fall through */
      }
    }
  }

  return rewriteResponse(res, url.origin, origin);
}

async function proxyTo(request, base, url) {
  const target = new URL(url.pathname + url.search, base);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // @ts-expect-error duplex
    init.duplex = "half";
  }
  try {
    const res = await fetch(target, init);
    const out = new Response(res.body, res);
    corsHeaders(request).forEach((v, k) => out.headers.set(k, v));
    return out;
  } catch (err) {
    return json({ ok: false, error: String(err) }, 502);
  }
}

function rewriteResponse(res, publicOrigin, uiOrigin) {
  const headers = new Headers(res.headers);
  // Strip framing / host-bound headers that break edge proxy
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("x-frame-options");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");

  const loc = headers.get("location");
  if (loc) {
    try {
      const u = new URL(loc, uiOrigin);
      if (u.origin === new URL(uiOrigin).origin) {
        headers.set("location", publicOrigin + u.pathname + u.search + u.hash);
      }
    } catch {
      /* keep */
    }
  }

  const type = (headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) {
    // Pass HTML through as stream-safe buffer and fix absolute origin links if any
    return res.arrayBuffer().then((buf) => {
      let html = new TextDecoder().decode(buf);
      html = html.split(uiOrigin).join(publicOrigin);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: res.status, statusText: res.statusText, headers });
    });
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bridge-Key",
    "Access-Control-Allow-Credentials": "true",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
