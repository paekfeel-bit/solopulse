/**
 * SoloPulse edge (mobile web app)
 * Board contact → service binding to solopulse-api (SoloRoom)
 * UI shell → UI_ORIGIN until OpenNext is fully on this worker
 */
const UI_ORIGIN = "https://solopulse-production.up.railway.app";
const PUBLIC_HOST = "solopulse.paekfeel.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const uiOrigin = (env.UI_ORIGIN || UI_ORIGIN).replace(/\/$/, "");
    const publicOrigin = `https://${PUBLIC_HOST}`;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    if (url.pathname === "/health" || url.pathname === "/api/cf-health") {
      return json({
        ok: true,
        app: "SoloPulse",
        stack: "cloudflare",
        edge: "solopulse",
        role: "mobile-webapp-primary",
        public: publicOrigin,
        board: "service:solopulse-api",
        hasApiBinding: !!env.BOARD_API,
        version: "edge-service-bind-6",
      });
    }

    // Board / agent / live WS → solopulse-api via service binding (reliable)
    if (
      url.pathname === "/ws" ||
      url.pathname.startsWith("/api/agent/")
    ) {
      return forwardBoard(request, env, url);
    }

    // Everything else → UI origin
    return forwardUi(request, uiOrigin, url, publicOrigin);
  },
};

async function forwardBoard(request, env, url) {
  const pathQ = url.pathname + url.search;
  // Prefer service binding (same-account, no public DNS)
  if (env.BOARD_API && typeof env.BOARD_API.fetch === "function") {
    try {
      return await env.BOARD_API.fetch(
        new Request("https://solopulse-api.internal" + pathQ, request)
      );
    } catch (e) {
      // fall through to public URL
      console.log("BOARD_API binding fail", String(e));
    }
  }
  // Fallback public
  try {
    return await fetch(
      "https://solopulse-api.paekfeel.workers.dev" + pathQ,
      request
    );
  } catch (e) {
    return json({ ok: false, error: "board api unreachable", detail: String(e) }, 502);
  }
}

async function forwardUi(request, origin, url, publicOrigin) {
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  headers.set("host", new URL(origin).host);
  headers.delete("content-length");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (e) {
    if (url.pathname.startsWith("/api/")) {
      return json(
        { ok: false, online: false, error: "ui origin down", detail: String(e) },
        502
      );
    }
    return json({ ok: false, error: "ui origin down", detail: String(e) }, 502);
  }

  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("content-security-policy");
  out.set("x-solopulse-edge", "service-bind-6");

  const type = (out.get("content-type") || "").toLowerCase();
  // API must never return HTML (CF/origin 502 pages break client JSON.parse)
  if (url.pathname.startsWith("/api/")) {
    const text = await res.text();
    const trimmed = (text || "").trim();
    if (
      !trimmed ||
      trimmed.startsWith("<!") ||
      trimmed.startsWith("<html") ||
      type.includes("text/html")
    ) {
      return json(
        {
          ok: false,
          online: false,
          error:
            res.status === 502
              ? "upstream 502 — board tunnel unavailable (pool monitor still works)"
              : `API returned non-JSON (HTTP ${res.status})`,
          status: res.status,
        },
        // 200 with JSON so browser clients can always parse
        200
      );
    }
    try {
      JSON.parse(trimmed);
    } catch {
      return json(
        {
          ok: false,
          online: false,
          error: `invalid JSON from origin HTTP ${res.status}`,
        },
        200
      );
    }
    out.set("content-type", "application/json; charset=utf-8");
    out.set("cache-control", "no-store");
    return new Response(trimmed, {
      status: res.status >= 500 ? 200 : res.status,
      headers: out,
    });
  }

  if (type.includes("text/html")) {
    let html = await res.text();
    html = html.split(origin).join(publicOrigin);
    const inject = `<script data-solopulse="board-cf">
(function(){
  var API="https://solopulse-api.paekfeel.workers.dev";
  var _f=window.fetch;
  window.fetch=function(input, init){
    try{
      var u=typeof input==="string"?input:(input&&input.url)||"";
      if(u.charAt(0)==="/"&&u.indexOf("/api/agent/")===0){
        return _f.call(this, API+u, init);
      }
      if(u.indexOf(location.origin+"/api/agent/")===0){
        return _f.call(this, API+u.slice(location.origin.length), init);
      }
    }catch(e){}
    return _f.apply(this, arguments);
  };
  // Prefer CF WS for live board
  var _WS=window.WebSocket;
  window.WebSocket=function(url, protocols){
    try{
      if(typeof url==="string" && url.indexOf(location.host+"/ws")>=0){
        url=url.replace(location.protocol==="https:"?"wss://"+location.host:"ws://"+location.host,
          "wss://solopulse-api.paekfeel.workers.dev");
      }
    }catch(e){}
    return protocols!==undefined? new _WS(url, protocols): new _WS(url);
  };
  window.WebSocket.prototype=_WS.prototype;
})();
</script>`;
    if (!html.includes('data-solopulse="board-cf"')) {
      html = html.replace("</head>", inject + "</head>");
    }
    out.set("content-type", "text/html; charset=utf-8");
    out.set("cache-control", "no-store");
    return new Response(html, { status: res.status, headers: out });
  }

  return new Response(res.body, { status: res.status, headers: out });
}

function cors(request) {
  return new Headers({
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Bridge-Key, x-agent-key",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
