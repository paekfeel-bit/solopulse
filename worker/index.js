/**
 * SoloPulse Cloudflare Worker entry (Git CI / workers.dev)
 * API/realtime lives on solopulse-api; this worker is the public edge shell.
 */
const API = "https://solopulse-api.paekfeel.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return json({ ok: true, app: "SoloPulse", stack: "cloudflare", edge: "solopulse" });
    }

    // Proxy API/auth/ws bootstrap paths to durable solopulse-api
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/ws") ||
      url.pathname.startsWith("/bridge")
    ) {
      const target = new URL(url.pathname + url.search, API);
      const headers = new Headers(request.headers);
      headers.delete("host");
      const init = {
        method: request.method,
        headers,
        redirect: "manual",
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
        // @ts-ignore
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

    // Default: status page (full Next UI remains on separate host until static assets wired)
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SoloPulse</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e8eef5;margin:0;min-height:100vh;display:grid;place-items:center}
    .card{max-width:28rem;padding:1.5rem 1.75rem;border:1px solid #1e2a36;border-radius:12px;background:#121a22}
    h1{margin:0 0 .5rem;font-size:1.35rem}
    p{margin:.4rem 0;color:#9fb0c0;line-height:1.45}
    code{background:#0b0f14;padding:.15rem .35rem;border-radius:4px;color:#7dd3fc}
    a{color:#38bdf8}
  </style>
</head>
<body>
  <div class="card">
    <h1>SoloPulse edge online</h1>
    <p>Cloudflare Worker <code>solopulse</code> is live.</p>
    <p>API: <a href="${API}/health">${API}/health</a></p>
    <p>Mobile pipeline uses Durable Objects over <code>wss://</code> — no local terminal required once the home bridge Windows service is installed.</p>
  </div>
</body>
</html>`;
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", ...Object.fromEntries(corsHeaders(request)) },
    });
  },
};

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
