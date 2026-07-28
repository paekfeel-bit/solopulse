"use client";

/**
 * Bridge setup UI — CORE product piece.
 * When bridge is LIVE (board streaming), setup/download layout auto-hides.
 * Users can re-open setup from the Bridge tab if the stream drops.
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
  /** When true and boardLive, render nothing (home). Full tab still shows slim status. */
  hideWhenLive = false,
}: {
  locale: string;
  address: string;
  boardLive: boolean;
  hashRateGhs: number;
  hostIp: string;
  staleMs: number;
  agentStatus: string;
  compact?: boolean;
  hideWhenLive?: boolean;
}) {
  const ko = locale === "ko";
  const clientId = (address || "default").trim() || "default";
  const batHref = `/api/bridge/bundle?clientId=${encodeURIComponent(clientId)}&format=bat`;
  const ps1Href = `/api/bridge/bundle?clientId=${encodeURIComponent(clientId)}&format=ps1`;
  const bridgePage = `/bridge?address=${encodeURIComponent(clientId)}`;

  // Home compact: disappear completely once linked
  if (boardLive && (hideWhenLive || compact)) {
    return null;
  }

  // Bridge tab while LIVE: slim status only (no download wall)
  if (boardLive) {
    return (
      <section className="rounded-2xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-600 font-semibold">
            Bridge · LINKED
          </div>
          <div className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
            ● {hashRateGhs.toFixed(1)} GH/s · {hostIp || "—"} · age{" "}
            {Number.isFinite(staleMs) ? `${(staleMs / 1000).toFixed(0)}s` : "—"}
          </div>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">
            {ko
              ? "연동 완료 — 다운로드 안내 숨김 · 소스엔진에 보드 해시 적용 중"
              : "Linked — setup hidden · board hashrate feeding source engine"}
          </p>
        </div>
      </section>
    );
  }

  // Not live: full setup / download layout
  return (
    <section className="rounded-2xl border border-amber-700/50 bg-gradient-to-b from-amber-950/30 to-[var(--bg)] p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500 font-semibold">
            Local Bridge · SETUP
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--fg)]">
            {ko ? "기기 브리지 연동" : "Link Device Bridge"}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed max-w-md">
            {ko
              ? "다운로드 후 집 PC에서 실행하면 보드 실시간 해시가 들어옵니다. 연동되면 이 안내는 자동으로 사라집니다."
              : "Download and run on home PC for live board hashrate. This setup UI hides automatically when linked."}
          </p>
        </div>
        <div className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg border shrink-0 border-amber-600/50 text-amber-700 dark:text-amber-200 bg-amber-500/10">
          ○ {agentStatus || "BRIDGE OFF"}
        </div>
      </div>

      <div className="text-xs text-amber-900 dark:text-amber-100/90 bg-[var(--bg)] rounded-lg px-3 py-2 border border-amber-900/20 dark:border-amber-900/40 leading-relaxed">
        {ko
          ? "브리지가 꺼져 있으면 보드 LIVE가 안 뜹니다. 아래 .bat 를 마이너와 같은 Wi‑Fi PC에서 실행하고 창을 유지하세요."
          : "Without the bridge, BOARD LIVE stays off. Run the .bat on the same Wi‑Fi PC as the miner."}
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <a
          href={batHref}
          className="text-center rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm py-3 px-3"
        >
          {ko ? "① Bridge .bat 다운로드" : "① Download Bridge .bat"}
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
        className="block text-center rounded-xl border border-amber-700/40 text-amber-800 dark:text-amber-200/90 text-sm py-2.5 hover:bg-amber-500/10"
      >
        {ko ? "브리지 설치 가이드 →" : "Bridge guide →"}
      </a>

      {!compact && (
        <div className="text-[10px] font-mono text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 space-y-1 leading-relaxed">
          <div className="font-semibold">
            {ko ? "이미 solopulse 폴더가 있는 경우" : "If repo already on disk"}
          </div>
          <div>
            set CLIENT_ID={clientId.slice(0, 24)}
            {clientId.length > 24 ? "…" : ""}
          </div>
          <div>set RAILWAY_WS=wss://solopulse-production.up.railway.app/ws</div>
          <div>start-bridge.bat</div>
        </div>
      )}
    </section>
  );
}
