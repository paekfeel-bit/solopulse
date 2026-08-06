"use client";

export type DashTab = "home" | "engine" | "odds" | "chart";

const TABS: {
  id: DashTab;
  icon: string;
  labelKo: string;
  labelEn: string;
}[] = [
  { id: "home", icon: "◎", labelKo: "홈", labelEn: "Home" },
  { id: "engine", icon: "⚡", labelKo: "엔진", labelEn: "Engine" },
  { id: "odds", icon: "🎲", labelKo: "확률", labelEn: "Odds" },
  { id: "chart", icon: "📈", labelKo: "차트", labelEn: "Charts" },
];

export function BottomNav({
  tab,
  onChange,
  locale,
}: {
  tab: DashTab;
  onChange: (t: DashTab) => void;
  locale: string;
  /** @deprecated unused — pool-only product */
  bridgeLive?: boolean;
  agentLive?: boolean;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--border)] bg-[var(--header)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Main menu"
    >
      <div className="max-w-3xl mx-auto grid grid-cols-4 gap-0.5 px-1 pt-1.5 pb-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          const label = locale === "ko" ? t.labelKo : t.labelEn;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`sp-tool-glow relative flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] rounded-xl border border-transparent touch-manipulation ${
                active
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_12px_1px_rgba(250,204,21,0.35)]"
                  : "text-[var(--muted)]"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {t.icon}
              </span>
              <span className="text-[9px] font-medium tracking-tight leading-none">
                {label}
              </span>
              {active && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-amber-500 shadow-[0_0_8px_2px_rgba(250,204,21,0.7)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
