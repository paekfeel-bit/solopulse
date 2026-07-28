"use client";

/**
 * Bridge is a CORE product piece (not optional fluff).
 * Site UI + Local Bridge together = live board hashrate → Source Engine.
 * Browser alone cannot reach home LAN; this panel is how the product is complete.
 */

export function BridgePanel({
  locale,
  address,
  boardLive,
  hashRateGhs,
  hostIp,
  staleMs,
  agentStatus,
  compact = false,
}: {
  locale: string;
  address: string;
  boardLive: boolean;
  hashRateGhs: number;
  hostIp: string;
  staleMs: number;
  agentStatus: string;
  compact?: boolean;
}) {
  const ko = locale === "ko";
  const clientId = (address || "default").trim() || "default";
  const batHref = `/api/bridge/bundle?clientId=${encodeURIComponent(clientId)}&format=bat`;
  const ps1Href = `/api/bridge/bundle?clientId=${encodeURIComponent(clientId)}&format=ps1`;
  const bridgePage = `/bridge?address=${encodeURIComponent(clientId)}`;

  return (
    <section
      className={`rounded-2xl border p-3 sm:p-4 space-y-3 ${
        boardLive
          ? "border-emerald-700/50 bg-gradient-to-b from-emerald-950/40 to-[var(--bg)]"
          : "border-amber-700/50 bg-gradient-to-b from-amber-950/30 to-[var(--bg)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500 font-semibold">
            Local Bridge · CORE
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--fg)]">
            {ko ? "기기 브리지 (사이트 연동 필수)" : "Device Bridge (required for board)"}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed max-w-md">
            {ko
              ? "브리지는 빼지 않습니다. 사이트 UI + 집 PC 브리지가 한 제품입니다. 보드 실시간 해시 → 소스엔진 컨택은 이 경로로만 됩니다."
              : "Bridge is not removed. Website UI + home PC bridge = one product. Live board hashrate → source engine only via this path."}
          </p>
        </div>
        <div
          className={`text-[10px] font-mono px-2.5 py-1.5 rounded-lg border shrink-0 ${
            boardLive
              ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
              : "border-amber-600/50 text-amber-200 bg-amber-500/10"
          }`}
        >
          {boardLive
            ? `● STREAMING · ${hashRateGhs.toFixed(1)} GH/s`
            : `○ ${agentStatus || "BRIDGE OFF"}`}
        </div>
      </div>

      {boardLive ? (
        <div className="text-xs font-mono text-emerald-300/90 bg-[var(--bg)] rounded-lg px-3 py-2 border border-emerald-900/40">
          {hostIp || "—"} · age{" "}
          {Number.isFinite(staleMs) ? `${(staleMs / 1000).toFixed(0)}s` : "—"} ·{" "}
          {ko ? "소스엔진 입력 = 이 보드 해시" : "source engine input = this board H"}
        </div>
      ) : (
        <div className="text-xs text-amber-100/90 bg-[var(--bg)] rounded-lg px-3 py-2 border border-amber-900/40 leading-relaxed">
          {ko
            ? "브리지가 꺼져 있으면 보드 LIVE가 안 뜹니다. 아래 .bat 를 집 PC(마이너와 같은 Wi‑Fi)에서 실행하고 창을 유지하세요."
            : "Without the bridge, BOARD LIVE stays off. Run the .bat on the home PC (same Wi‑Fi as miner) and keep the window open."}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        <a
          href={batHref}
          className="text-center rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3 px-3"
        >
          {ko ? "① Bridge .bat 다운로드 (주소 포함)" : "① Download Bridge .bat"}
        </a>
        <a
          href={ps1Href}
          className="text-center rounded-xl border border-[var(--border)] text-[var(--fg)] text-sm py-3 px-3 hover:border-amber-600/50"
        >
          {ko ? "PowerShell .ps1" : "PowerShell .ps1"}
        </a>
      </div>

      <a
        href={bridgePage}
        className="block text-center rounded-xl border border-amber-700/40 text-amber-200/90 text-sm py-2.5 hover:bg-amber-950/40"
      >
        {ko ? "브리지 설치 가이드 페이지 열기 →" : "Open full Bridge guide →"}
      </a>

      {!compact && (
        <div className="text-[10px] font-mono text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 space-y-1 leading-relaxed">
          <div className="text-[var(--muted)] font-semibold">
            {ko ? "이미 solopulse 폴더가 있는 경우" : "If repo already on disk"}
          </div>
          <div>set CLIENT_ID={clientId.slice(0, 24)}{clientId.length > 24 ? "…" : ""}</div>
          <div>set RAILWAY_WS=wss://solopulse-production.up.railway.app/ws</div>
          <div>start-bridge.bat</div>
          <div className="text-[var(--muted)] pt-1">
            {ko
              ? "파이프라인: [마이너 LAN] ←브리지→ [Railway /ws] ←웹→ [게이지·소스엔진]"
              : "Pipeline: [miner LAN] ←bridge→ [Railway /ws] ←web→ [gauges · source engine]"}
          </div>
        </div>
      )}
    </section>
  );
}
