"use client";

interface Props {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "amber" | "green" | "red" | "pulse";
  live?: boolean;
}

export function StatCard({ label, value, sub, accent = "default", live }: Props) {
  const valueColor =
    accent === "amber"
      ? "text-[var(--accent)]"
      : accent === "green"
        ? "text-emerald-500"
        : accent === "red"
          ? "text-red-500"
          : accent === "pulse"
            ? "text-orange-500"
            : "text-[var(--fg)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 sm:p-4 flex flex-col gap-0.5 min-w-0 overflow-hidden">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium truncate leading-none">
          {label}
        </span>
        {live && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
        )}
      </div>
      <div
        className={`text-sm sm:text-lg font-semibold font-mono tabular-nums leading-snug break-all ${valueColor}`}
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        title={value}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[9px] sm:text-[10px] text-[var(--muted)] truncate leading-snug"
          title={sub}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
