"use client";

/**
 * Optional advanced board path only.
 * Pool path is primary — this is not required for source engine.
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

  if (boardLive && (hideWhenLive || compact)) return null;

  if (boardLive) {
    return (
      <section className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-emerald-400">
              {ko ? "보드 온라인" : "Board online"}
            </div>
            <div className="text-xs font-mono text-emerald-300/90 tabular-nums">
              {hashRateGhs.toFixed(1)} GH/s · {hostIp || "—"} ·{" "}
              {Number.isFinite(staleMs) ? `${(staleMs / 1000).toFixed(0)}s` : "—"}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Compact home: hide clutter entirely
  if (compact) return null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          <h2 className="text-sm font-bold text-[var(--fg)]">
            {ko ? "보드 상세 (선택 · 고급)" : "Board detail (optional · advanced)"}
          </h2>
        </div>
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          {ko
            ? "해시·소스엔진은 지갑+풀만으로 됩니다. 보드 온도까지 클라우드에서 보려면 집 PC에서 아래 .bat을 한 번 실행해 두거나, 공개 HTTPS 터널 URL을 쓰면 됩니다. 팝업/about:blank는 쓰지 않습니다."
            : "Hashrate/engine work with wallet+pool alone. For board temp from the cloud, run the .bat on a home PC or use a public HTTPS tunnel URL. No popups/about:blank."}
        </p>
      </div>

      <div className="text-[10px] font-mono px-2 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] inline-block">
        ○ {agentStatus || "BOARD OFF"}
      </div>

      <a
        href={batHref}
        className="block text-center rounded-xl border border-[var(--border)] hover:border-amber-500/40 text-sm py-3 px-3 text-[var(--fg)]"
      >
        {ko ? "선택: 집 PC 브리지 .bat 다운로드" : "Optional: download home PC bridge .bat"}
      </a>
    </section>
  );
}
