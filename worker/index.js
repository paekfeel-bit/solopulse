/**
 * SoloPulse public edge (mobile web app entry)
 * https://solopulse.paekfeel.workers.dev
 *
 * Full Next UI + API proxied from Railway origin.
 * Live board WebSocket: browsers on workers.dev connect to Railway wss
 * (see useAgentTelemetry). This worker still attempts /ws proxy for completeness.
 */
const API = "https://solopulse-api.paekfeel.workers.dev";
const UI_ORIGIN = "https://solopulse-production.up.railway.app";
const PUBLIC_HOST = "solopulse.paekfeel.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const uiOrigin = (env.UI_ORIGIN || UI_ORIGIN).replace(/\/$/, "");
    const apiBase = (env.API_BASE || API).replace(/\/$/, "");
    const publicOrigin = `https://${PUBLIC_HOST}`;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health / mobile install probe
    if (url.pathname === "/health" || url.pathname === "/api/cf-health") {
      return json({
        ok: true,
        app: "SoloPulse",
        stack: "cloudflare",
        edge: "solopulse",
        role: "mobile-webapp-primary",
        public: publicOrigin,
        ui: uiOrigin,
        api: apiBase,
        version: "edge-mobile-3",
      });
    }

    // WebSocket upgrade → Railway (best-effort; client also has direct fallback)
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade === "websocket" || url.pathname === "/ws") {
      return proxyWebSocket(request, uiOrigin, url);
    }

    if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/bridge/ws")) {
      return proxyHttp(request, apiBase, url, { publicOrigin });
    }

    // Full app (HTML/API/static/PWA) from Railway, rewritten onto this host
    return proxyHttp(request, uiOrigin, url, {
      rewriteHtml: true,
      publicOrigin,
    });
  },
};

async function proxyWebSocket(request, origin, url) {
  const target = new URL(url.pathname + url.search, origin);
  try {
    return await fetch(target, request);
  } catch (err) {
    return json(
      {
        ok: false,
        error: "WebSocket proxy failed",
        detail: String(err?.message || err),
        hint: "Client should use wss://solopulse-production.up.railway.app/ws",
      },
      502
    );
  }
}

async function proxyHttp(request, origin, url, opts = {}) {
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  headers.set("host", new URL(origin).host);
  headers.set("x-forwarded-host", PUBLIC_HOST);
  headers.set("x-forwarded-proto", "https");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    cf: { cacheTtl: isStaticPath(url.pathname) ? 3600 : 0 },
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

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      try {
        const next = new URL(loc, origin);
        if (next.origin === new URL(origin).origin) {
          res = await fetch(next, { method: "GET", headers, redirect: "manual" });
        }
      } catch {
        /* */
      }
    }
  }

  return rewriteResponse(res, opts.publicOrigin || `https://${PUBLIC_HOST}`, origin, url.pathname);
}

function isStaticPath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2")
  );
}

function stripHop(headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("x-frame-options");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
}

function rewriteResponse(res, publicOrigin, uiOrigin, pathname) {
  const headers = new Headers(res.headers);
  stripHop(headers);

  // Mobile-friendly cache
  if (pathname === "/" || pathname.endsWith(".html") || !pathname.includes(".")) {
    headers.set("cache-control", "no-store, must-revalidate");
  } else if (isStaticPath(pathname)) {
    headers.set("cache-control", "public, max-age=3600, immutable");
  }

  // PWA / installability helpers
  headers.set("x-solopulse-edge", "mobile-primary");
  headers.set("x-solopulse-public", publicOrigin);

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

  // Rewrite PWA manifest to this host (install as web app on mobile)
  if (
    pathname.endsWith("manifest.webmanifest") ||
    pathname.endsWith("manifest.json") ||
    type.includes("application/manifest")
  ) {
    return res.text().then((raw) => {
      try {
        const m = JSON.parse(raw);
        m.start_url = `${publicOrigin}/?source=pwa`;
        m.scope = `${publicOrigin}/`;
        m.id = `${publicOrigin}/`;
        m.name = m.name || "SoloPulse — Solo Mining Radar";
        m.short_name = m.short_name || "SoloPulse";
        m.display = "standalone";
        headers.set("content-type", "application/manifest+json; charset=utf-8");
        headers.set("cache-control", "no-store");
        return new Response(JSON.stringify(m), {
          status: res.status,
          headers,
        });
      } catch {
        return new Response(raw, { status: res.status, headers });
      }
    });
  }

  if (type.includes("text/html")) {
    return res.arrayBuffer().then((buf) => {
      let html = new TextDecoder().decode(buf);
      html = html.split(uiOrigin).join(publicOrigin);
      // Ensure mobile web-app meta present
      if (!/mobile-web-app-capable/i.test(html)) {
        html = html.replace(
          "</head>",
          `<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.webmanifest" />
</head>`
        );
      }
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    });
  }

  // JSON that may embed absolute Railway URLs
  if (type.includes("application/json") || type.includes("javascript")) {
    return res.arrayBuffer().then((buf) => {
      let text = new TextDecoder().decode(buf);
      if (text.includes(uiOrigin)) {
        text = text.split(uiOrigin).join(publicOrigin);
      }
      return new Response(text, {
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
