/**
 * Same-Wi‑Fi device link without install.
 *
 * Why typing IP in the address bar works but SoloPulse fetch fails:
 * - Address bar = top-level navigation to http://IP (allowed)
 * - SoloPulse is HTTPS → browser blocks fetch('http://IP/...') (mixed content)
 * - Cloud server also cannot reach private LAN IPs
 *
 * Fix: open a tiny connector page as a data: URL (opaque origin).
 * That page can fetch the miner HTTP API, postMessage results to the app,
 * and optionally push telemetry to Cloudflare SoloRoom.
 */

import {
  parseAxeOsPayload,
  parseDeviceTarget,
  type DeviceInfo,
} from "@/lib/deviceClient";

export const DEVICE_MSG = "solopulse-device-v1";
export const CF_TELEMETRY =
  "https://solopulse-api.paekfeel.workers.dev/api/agent/telemetry";

/**
 * Bookmarklet: run while the address bar is on the miner homepage (same origin).
 * That is the only way browsers can read AxeOS when CORS is closed.
 */
export function buildMinerBookmarklet(clientId: string): string {
  const cid = (clientId || "default").trim() || "default";
  // Keep short — mobile address bars truncate long javascript: URLs
  const code = `(()=>{const C=${JSON.stringify(cid)},T=${JSON.stringify(CF_TELEMETRY)},M=${JSON.stringify(DEVICE_MSG)};(async()=>{try{const r=await fetch('/api/system/info',{cache:'no-store'});const j=await r.json();const g=Number(j.hashRate||j.hashrate||j.hashRate_1m||0);const ghs=g>=1e11?g/1e9:g;const info={online:true,live:true,ip:location.host,deviceModel:String(j.ASICModel||j.deviceModel||j.hostname||'AxeOS'),hashRateGhs:ghs,hashRateHs:ghs*1e9,windows:{instantGhs:ghs,m1Ghs:ghs,m10Ghs:ghs,h1Ghs:ghs,d1Ghs:ghs},temp:j.temp!=null?Number(j.temp):(j.vrTemp!=null?Number(j.vrTemp):null),power:j.power!=null?Number(j.power):null,bestDiff:Number(j.bestDiff||0),bestSessionDiff:Number(j.bestSessionDiff||0),networkDifficulty:Number(j.networkDifficulty||0),foundBlocks:Number(j.foundBlocks||j.blockFound||0),totalFoundBlocks:Number(j.totalFoundBlocks||0),sharesAccepted:Number(j.sharesAccepted||0),sharesRejected:Number(j.sharesRejected||0),fetchedAt:Date.now(),via:'direct'};try{if(window.opener)window.opener.postMessage({type:M,ok:true,info,clientId:C},'*');}catch(e){}const body={schemaVersion:1,deviceId:location.host,deviceModel:info.deviceModel,hostIp:location.host,hashRateGhs:ghs,hashRateHs:ghs*1e9,windows:info.windows,tempC:info.temp,powerW:info.power,fanRpm:null,bestDiff:info.bestDiff,bestSessionDiff:info.bestSessionDiff,networkDifficulty:info.networkDifficulty,sharesAccepted:info.sharesAccepted,sharesRejected:info.sharesRejected,foundBlocks:info.foundBlocks,totalFoundBlocks:info.totalFoundBlocks,uptimeSec:null,firmware:null,collectedAt:Date.now(),agentId:'bookmarklet',agentStatus:'STREAMING',source:'axeos',clientId:C};await fetch(T+'?clientId='+encodeURIComponent(C),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),mode:'cors'});alert('SoloPulse OK '+(ghs?ghs.toFixed(1)+' GH/s':'online'));}catch(e){alert('연동 실패: '+(e&&e.message?e.message:e));}})();})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function openMinerHome(rawIp: string): Window | null {
  if (typeof window === "undefined") return null;
  const t = parseDeviceTarget(rawIp);
  const url = t?.base || `http://${rawIp.trim()}`;
  // Keep window.opener so bookmarklet on miner page can postMessage back
  return window.open(url, "solopulse-miner-home");
}

const PATHS = [
  "/api/system/info",
  "/api/system/status",
  "/api/system/asic",
  "/api/system",
];

export function isMixedContentBlockLikely(rawHost: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  const t = parseDeviceTarget(rawHost);
  if (!t) return false;
  return t.privateLan || t.base.startsWith("http://");
}

/** Build self-contained connector HTML (runs in data: window). */
export function buildDeviceConnectorHtml(opts: {
  ip: string;
  clientId: string;
  pollMs?: number;
}): string {
  const ip = opts.ip.trim();
  const clientId = (opts.clientId || "default").trim() || "default";
  const pollMs = opts.pollMs ?? 2500;
  const target = parseDeviceTarget(ip);
  const base = target?.base || `http://${ip}`;

  // Keep HTML compact; no template external deps.
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>SoloPulse · 기기 연동</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; font-family: ui-sans-serif, system-ui, sans-serif;
    background: #0c0a09; color: #fafaf9;
    display: flex; align-items: center; justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  }
  .card {
    width: min(100%, 420px); border: 1px solid #f59e0b66; border-radius: 16px;
    background: #1c1917; padding: 18px; box-shadow: 0 20px 50px #000a;
  }
  h1 { margin: 0; font-size: 16px; color: #fbbf24; }
  p { margin: 8px 0 0; font-size: 12px; color: #a8a29e; line-height: 1.45; }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; }
  .status {
    margin-top: 14px; padding: 12px; border-radius: 12px; border: 1px solid #44403c;
    background: #0c0a09; font-size: 13px; line-height: 1.4;
  }
  .ok { border-color: #05966988; color: #6ee7b7; }
  .err { border-color: #b91c1c88; color: #fca5a5; }
  .wait { border-color: #d9770688; color: #fcd34d; }
  button {
    margin-top: 12px; width: 100%; border: 0; border-radius: 12px;
    background: #f59e0b; color: #1c1917; font-weight: 700; font-size: 14px;
    padding: 12px; cursor: pointer;
  }
  .hint { margin-top: 10px; font-size: 11px; color: #78716c; }
</style>
</head>
<body>
<div class="card">
  <h1>⚡ SoloPulse 기기 연동</h1>
  <p>이 창은 브라우저 보안(HTTPS→HTTP 차단)을 우회해 보드를 읽습니다. 닫지 마세요.</p>
  <p class="mono">대상: ${escapeHtml(base)}</p>
  <div id="st" class="status wait">연결 중…</div>
  <button type="button" id="retry">다시 연결</button>
  <p class="hint">연동되면 원래 SoloPulse 탭에서 소스엔진·보드 컨택이 LIVE로 바뀝니다.</p>
</div>
<script>
(function () {
  var BASE = ${JSON.stringify(base)};
  var CLIENT_ID = ${JSON.stringify(clientId)};
  var PATHS = ${JSON.stringify(PATHS)};
  var CF = ${JSON.stringify(CF_TELEMETRY)};
  var MSG = ${JSON.stringify(DEVICE_MSG)};
  var POLL = ${JSON.stringify(pollMs)};
  var st = document.getElementById("st");
  var timer = null;

  function setStatus(cls, text) {
    st.className = "status " + cls;
    st.textContent = text;
  }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }

  function toGhs(raw) {
    var n = Number(raw);
    if (!isFinite(n) || n <= 0) return 0;
    if (n >= 1e11) return n / 1e9;
    return n;
  }

  function firstNumber() {
    for (var i = 0; i < arguments.length; i++) {
      var n = Number(arguments[i]);
      if (isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  function parseInfo(raw, displayHost) {
    var ghs = toGhs(firstNumber(raw.hashRate, raw.hashrate, raw.hash_rate, raw.HashRate, raw.hashRateCurrent, raw.currentHashrate));
    if (!(ghs > 0)) ghs = toGhs(firstNumber(raw.hashRate_1m, raw.hashrate_1m));
    var temp = firstNumber(raw.temp, raw.temperature, raw.temp_board, raw.tempBoard, raw.asic_temp, raw.asicTemp, raw.vrTemp);
    var power = num(raw.power, NaN);
    return {
      online: true,
      live: true,
      ip: displayHost,
      deviceModel: String(raw.deviceModel || raw.ASICModel || raw.hostname || raw.boardVersion || "AxeOS miner"),
      hashRateGhs: ghs,
      hashRateHs: ghs * 1e9,
      windows: { instantGhs: ghs, m1Ghs: ghs, m10Ghs: ghs, h1Ghs: ghs, d1Ghs: ghs },
      temp: temp > 0 ? temp : null,
      power: isFinite(power) ? power : null,
      bestDiff: num(raw.bestDiff) || num(raw.bestSessionDiff),
      bestSessionDiff: num(raw.bestSessionDiff) || num(raw.bestDiff),
      networkDifficulty: num(raw.networkDifficulty),
      foundBlocks: num(raw.foundBlocks),
      totalFoundBlocks: num(raw.totalFoundBlocks),
      sharesAccepted: num(raw.sharesAccepted),
      sharesRejected: num(raw.sharesRejected),
      fetchedAt: Date.now(),
      via: "direct"
    };
  }

  function publish(info) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: MSG, ok: true, info: info, clientId: CLIENT_ID }, "*");
      }
    } catch (e) {}
    var body = {
      schemaVersion: 1,
      deviceId: info.ip || CLIENT_ID,
      deviceModel: info.deviceModel,
      hostIp: info.ip,
      hashRateGhs: info.hashRateGhs,
      hashRateHs: info.hashRateHs,
      windows: info.windows,
      tempC: info.temp,
      powerW: info.power,
      fanRpm: null,
      bestDiff: info.bestDiff,
      bestSessionDiff: info.bestSessionDiff,
      networkDifficulty: info.networkDifficulty,
      sharesAccepted: info.sharesAccepted,
      sharesRejected: info.sharesRejected,
      foundBlocks: info.foundBlocks,
      totalFoundBlocks: info.totalFoundBlocks,
      uptimeSec: null,
      firmware: null,
      collectedAt: Date.now(),
      agentId: "browser-connector",
      agentStatus: "STREAMING",
      source: "axeos",
      clientId: CLIENT_ID
    };
    try {
      fetch(CF + "?clientId=" + encodeURIComponent(CLIENT_ID), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        mode: "cors",
        cache: "no-store"
      }).catch(function () {});
    } catch (e) {}
  }

  async function pullOnce() {
    var lastErr = "unreachable";
    for (var i = 0; i < PATHS.length; i++) {
      var url = BASE.replace(/\\/$/, "") + PATHS[i];
      try {
        var res = await fetch(url, {
          cache: "no-store",
          mode: "cors",
          headers: { Accept: "application/json, text/plain, */*" }
        });
        if (!res.ok) { lastErr = "HTTP " + res.status + " @ " + PATHS[i]; continue; }
        var text = await res.text();
        var raw = null;
        try { raw = JSON.parse(text); } catch (e) {
          var a = text.indexOf("{"), b = text.lastIndexOf("}");
          if (a >= 0 && b > a) {
            try { raw = JSON.parse(text.slice(a, b + 1)); } catch (e2) {}
          }
        }
        if (!raw) { lastErr = "bad JSON @ " + PATHS[i]; continue; }
        var host = BASE.replace(/^https?:\\/\\//i, "").split("/")[0];
        var info = parseInfo(raw, host);
        if (!(info.hashRateGhs > 0)) {
          // still accept temp-only online board
        }
        publish(info);
        setStatus(
          "ok",
          "LIVE · " + (info.hashRateGhs ? info.hashRateGhs.toFixed(1) + " GH/s" : "online") +
          (info.temp != null ? " · " + info.temp + "°C" : "") +
          " · " + info.deviceModel
        );
        return true;
      } catch (e) {
        lastErr = (e && e.message) ? e.message : String(e);
      }
    }
    setStatus(
      "err",
      "실패: " + lastErr +
        " — 보드 CORS/보안 가능. 아래 「기기 홈 열기」후 주소창에 연동코드 붙여넣기, 또는 SoloPulse에서 북마크릿 실행"
    );
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: MSG, ok: false, error: lastErr, ip: BASE, needBookmarklet: true }, "*");
      }
    } catch (e) {}
    return false;
  }

  async function loop() {
    await pullOnce();
    timer = setTimeout(loop, POLL);
  }

  document.getElementById("retry").onclick = function () {
    if (timer) clearTimeout(timer);
    setStatus("wait", "다시 연결 중…");
    loop();
  };

  loop();
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Open the connector. Returns the window handle or null if popup blocked.
 * Prefer data: URL (opaque origin → can talk to http://LAN).
 */
export function openDeviceConnector(opts: {
  ip: string;
  clientId: string;
}): Window | null {
  if (typeof window === "undefined") return null;
  const html = buildDeviceConnectorHtml(opts);
  // data: URL → opaque origin; can fetch private HTTP APIs from many browsers
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const w = window.open(url, "solopulse-device-link", "popup=yes,width=440,height=640");
  if (w) {
    try {
      w.focus();
    } catch {
      /* */
    }
  }
  return w;
}

/** Fallback download if popup blocked */
export function downloadDeviceConnector(opts: {
  ip: string;
  clientId: string;
}): void {
  if (typeof window === "undefined") return;
  const html = buildDeviceConnectorHtml(opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `solopulse-device-${opts.ip.replace(/[^\w.-]+/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function deviceInfoFromMessage(data: unknown): DeviceInfo | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: string; ok?: boolean; info?: DeviceInfo };
  if (d.type !== DEVICE_MSG || !d.ok || !d.info) return null;
  const info = d.info;
  if (!info.online) return null;
  // Re-normalize in case postMessage stripped fields
  const ghs = Number(info.hashRateGhs) || 0;
  return {
    ...info,
    hashRateGhs: ghs,
    hashRateHs: ghs > 0 ? ghs * 1e9 : Number(info.hashRateHs) || 0,
    fetchedAt: Date.now(),
    online: true,
    live: true,
    via: "direct",
  };
}

/** Optional: parse raw AxeOS JSON when testing */
export function parseDeviceJson(
  raw: Record<string, unknown>,
  host: string
): DeviceInfo {
  return parseAxeOsPayload(raw, host, "direct");
}
