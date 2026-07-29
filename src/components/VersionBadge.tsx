"use client";

import { useEffect, useState } from "react";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Shows app version. Always re-fetches /api/version so after deploy
 * a hard/soft refresh picks up the new patch without relying on cached JS alone.
 */
export function VersionBadge({
  className = "",
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const [label, setLabel] = useState(APP_VERSION_LABEL);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/version?_=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { label?: string; version?: string };
        if (cancelled) return;
        if (j.label) setLabel(j.label);
        else if (j.version) setLabel(`V${j.version}`);
      } catch {
        /* keep bundle fallback */
      }
    };
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const cls =
    size === "md"
      ? "text-sm font-mono font-bold text-amber-500 tabular-nums tracking-wide"
      : "text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums";

  return (
    <span className={`${cls} ${className}`} title={`SoloPulse ${label}`}>
      {label}
    </span>
  );
}
