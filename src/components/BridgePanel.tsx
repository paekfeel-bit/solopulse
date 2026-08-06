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

  // Not live: optional board extras (pool path already powers source engine)
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)] font-semibold">
            {ko ? "보드 상세 · 선택" : "Board detail · optional"}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--fg)]">
            {ko ? "온도·LAN 실측 (필수 아님)" : "Temp / LAN stats (not required)"}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed max-w-md">
            {ko
              ? "해시레이트·소스엔진·확률은 지갑+풀만으로 이미 실시간입니다. 아래는 보드 온도 등 추가 지표용 옵션입니다."
              : "Hashrate, source engine, and odds already run live from wallet+pool. Below is optional for board temperature and extra stats."}
          </p>
        </div>
        <div className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg border shrink-0 border-[var(--border)] text-[var(--muted)]">
          ○ {agentStatus || "BOARD OFF"}
        </div>
      </div>

      <div className="text-xs text-[var(--fg)] bg-[var(--bg)] rounded-lg px-3 py-2 border border-[var(--border)] leading-relaxed">
        {ko
          ? "① 같은 Wi‑Fi에서 보드 LAN IP 입력 · ② 공개 HTTPS 터널 URL · ③ (고급) 집 PC 브리지 .bat — 모두 선택 사항입니다."
          : "① Board LAN IP on same Wi‑Fi · ② Public HTTPS tunnel URL · ③ (advanced) home PC bridge .bat — all optional."}
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <a
          href={batHref}
          className="text-center rounded-xl border border-amber-600/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-semibold text-sm py-3 px-3"
        >
          {ko ? "선택 · Bridge .bat" : "Optional · Bridge .bat"}
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
        className="block text-center rounded-xl border border-[var(--border)] text-[var(--muted)] text-sm py-2.5 hover:bg-[var(--bg)]"
      >
        {ko ? "보드 연동 가이드 (선택) →" : "Board link guide (optional) →"}
      </a>

      {!compact && (
        <div className="text-[10px] font-mono text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 space-y-1 leading-relaxed">
          <div className="font-semibold">
            {ko ? "고급: 로컬 브리지 (CF SoloRoom)" : "Advanced: local bridge (CF SoloRoom)"}
          </div>
          <div>
            set CLIENT_ID={clientId.slice(0, 24)}
            {clientId.length > 24 ? "…" : ""}
          </div>
          <div>
            set CF_WS=wss://solopulse-api.paekfeel.workers.dev/ws
          </div>
          <div>start-bridge.bat</div>
        </div>
      )}
    </section>
  );
}
