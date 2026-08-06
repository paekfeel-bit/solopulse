"use client";

/**
 * Green / red board-link indicator (like device online LED).
 */
export type BoardLinkLight =
  | "online" // linked + live stream
  | "reconnecting" // linked but temporarily offline
  | "offline" // linked, hard offline
  | "unlinked"; // never linked

export function DeviceLinkLight({
  state,
  locale = "ko",
  ip,
  ghs,
  className = "",
}: {
  state: BoardLinkLight;
  locale?: string;
  ip?: string;
  ghs?: number;
  className?: string;
}) {
  const ko = locale === "ko";
  const color =
    state === "online"
      ? "bg-emerald-500"
      : state === "reconnecting"
        ? "bg-amber-400"
        : state === "offline"
          ? "bg-red-500"
          : "bg-zinc-500";
  const ring =
    state === "online"
      ? "bg-emerald-400"
      : state === "reconnecting"
        ? "bg-amber-400"
        : state === "offline"
          ? "bg-red-400"
          : "bg-zinc-400";
  const label =
    state === "online"
      ? ko
        ? "연동됨 · 온라인"
        : "Linked · ONLINE"
      : state === "reconnecting"
        ? ko
          ? "연동됨 · 재연결 중"
          : "Linked · reconnecting"
        : state === "offline"
          ? ko
            ? "연동됨 · 오프라인"
            : "Linked · OFFLINE"
          : ko
            ? "미연동"
            : "Not linked";
  const detail =
    state === "online" && (ip || ghs != null)
      ? `${ip || "—"}${ghs != null && ghs > 0 ? ` · ${ghs.toFixed(1)} GH/s` : ""}`
      : state === "reconnecting" || state === "offline"
        ? ip
          ? `${ip} · ${ko ? "자동 재연결" : "auto-reconnect"}`
          : ko
            ? "IP 기억 · 자동 재연결"
            : "IP remembered · auto-reconnect"
        : ko
          ? "IP 연결 필요"
          : "Connect IP";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 min-h-[2rem] ${
        state === "online"
          ? "border-emerald-500/50 bg-emerald-500/10"
          : state === "reconnecting"
            ? "border-amber-500/50 bg-amber-500/10"
            : state === "offline"
              ? "border-red-500/50 bg-red-500/10"
              : "border-[var(--border)] bg-[var(--card)]"
      } ${className}`}
      role="status"
      aria-live="polite"
      title={`${label}${detail ? ` · ${detail}` : ""}`}
    >
      <span className="relative flex h-3 w-3 shrink-0">
        {(state === "online" || state === "reconnecting") && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${ring} opacity-60`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
      </span>
      <span className="flex flex-col min-w-0 leading-tight">
        <span
          className={`text-[11px] font-bold tracking-tight ${
            state === "online"
              ? "text-emerald-400"
              : state === "reconnecting"
                ? "text-amber-400"
                : state === "offline"
                  ? "text-red-400"
                  : "text-[var(--muted)]"
          }`}
        >
          {label}
        </span>
        <span className="text-[9px] font-mono text-[var(--muted)] truncate max-w-[14rem]">
          {detail}
        </span>
      </span>
    </div>
  );
}
