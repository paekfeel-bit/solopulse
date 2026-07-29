/**
 * SoloPulse CF edge — Railway UI + /ws WebSocket proxy.
 * Device bridge / browser live telemetry need WebSocket Upgrade passthrough.
 */
const API = "https://solopulse-api.paekfeel.workers.dev";
const UI_ORIGIN = "https://solopulse-production.up.railway.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const uiOrigin = (env.UI_ORIGIN || UI_ORIGIN).replace(/\/$/, "");
    const apiBase = (env.API_BASE || API).replace(/\/$/, "");

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
        version: "proxy-ws-2",
      });
    }

    // ── WebSocket: must pass the original Request (Upgrade) to Railway ──
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade === "websocket" || url.pathname === "/ws") {
      return proxyWebSocket(request, uiOrigin, url);
    }

    // CF-native API worker (auth / durable rooms) if used later
    if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/bridge/ws")) {
      return proxyHttp(request, apiBase, url);
    }

    // Full Railway Next UI + /api/*
    return proxyHttp(request, uiOrigin, url, { rewriteHtml: true, publicOrigin: url.origin });
  },
};

/** WebSocket upgrade passthrough — pass original Request as init (CF requirement) */
async function proxyWebSocket(request, origin, url) {
  const target = new URL(url.pathname + url.search, origin);
  try {
    // Critical: second arg must be the original request for Upgrade headers
    return await fetch(target, request);
  } catch (err) {
    return json(
      {
        ok: false,
        error: "WebSocket proxy failed",
        detail: String(err?.message || err),
        target: target.toString(),
        hint: "Browser should use direct Railway wss via useAgentTelemetry fallback",
      },
      502
    );
  }
}

async function proxyHttp(request, origin, url, opts = {}) {
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  headers.set("host", new URL(origin).host);
  // Drop hop-by-hop that confuse origin
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (err) {
    return json({ ok: false, error: "origin unreachable", detail: String(err) }, 502);
  }

  // One-hop redirect on same origin
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      try {
        const next = new URL(loc, origin);
        if (next.origin === new URL(origin).origin) {
          res = await fetch(next, { method: "GET", headers, redirect: "manual" });
        }
      } catch {
        /* keep */
      }
    }
  }

  if (opts.rewriteHtml && opts.publicOrigin) {
    return rewriteResponse(res, opts.publicOrigin, origin);
  }

  const outHeaders = new Headers(res.headers);
  stripHop(outHeaders);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders,
  });
}

function stripHop(headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("x-frame-options");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
}

function rewriteResponse(res, publicOrigin, uiOrigin) {
  const headers = new Headers(res.headers);
  stripHop(headers);

  const loc = headers.get("location");
  if (loc) {
    try {
      const u = new URL(loc, uiOrigin);
      if (u.origin === new URL(uiOrigin).origin) {
        headers.set("location", publicOrigin + u.pathname + u.search + u.hash);
      }
    } catch {
      /* */
    }
  }

  const type = (headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) {
    return res.arrayBuffer().then((buf) => {
      let html = new TextDecoder().decode(buf);
      html = html.split(uiOrigin).join(publicOrigin);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    });
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
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
