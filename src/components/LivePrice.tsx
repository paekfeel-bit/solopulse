"use client";

import { useLivePrice } from "@/hooks/useLivePrice";
import { useI18n } from "@/lib/i18n";

export function LivePrice({ seed }: { seed: number }) {
  const { t } = useI18n();
  const { price, base, delta, up } = useLivePrice(seed);

  if (!price && !seed) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 min-w-0 overflow-hidden">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{t("btcPrice")}</div>
        <div className="text-sm font-mono text-[var(--muted)]">—</div>
      </div>
    );
  }

  const shown = price || seed;
  const whole = Math.floor(shown).toLocaleString("en-US");
  const frac = (shown % 1).toFixed(2).slice(1); // .xx
  // extra live digits
  const micro = ((shown * 100) % 1).toFixed(2).slice(1); // fake sub-cent visual from float

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] truncate">
          {t("btcPrice")}
        </div>
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
      </div>
      <div
        className={`text-lg sm:text-xl font-bold font-mono tabular-nums leading-tight break-all ${
          up ? "text-emerald-500" : "text-red-400"
        }`}
      >
        ${whole}
        <span className="text-sm sm:text-base">{frac}</span>
        <span className="text-[10px] opacity-60">{micro.replace(".", "")}</span>
      </div>
      <div className="text-[10px] font-mono text-[var(--muted)] truncate">
        spot ${base > 0 ? base.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
        {delta !== 0 && (
          <span className={delta >= 0 ? " text-emerald-500" : " text-red-400"}>
            {" "}
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
