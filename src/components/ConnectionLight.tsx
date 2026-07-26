"use client";

import type { LinkStatus } from "@/hooks/useOnlineStatus";
import { useI18n } from "@/lib/i18n";

export function ConnectionLight({ status }: { status: LinkStatus }) {
  const { t } = useI18n();
  const color =
    status === "online"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-400"
        : "bg-red-500";
  const label =
    status === "online" ? t("online") : status === "degraded" ? t("connecting") : t("offline");
  const ring =
    status === "online"
      ? "bg-emerald-400"
      : status === "degraded"
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1"
      title={label}
    >
      <span className="relative flex h-2 w-2">
        {status === "online" && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${ring} opacity-60`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
      </span>
      <span className="text-[10px] font-medium text-[var(--muted)] hidden sm:inline">
        {label}
      </span>
    </div>
  );
}
