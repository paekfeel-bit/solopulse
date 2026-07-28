"use client";

export type DashTab =
  | "cluster"
  | "engine"
  | "odds"
  | "chart"
  | "network"
  | "more";

const TABS: {
  id: DashTab;
  icon: string;
  labelKo: string;
  labelEn: string;
}[] = [
  { id: "cluster", icon: "◎", labelKo: "계기판", labelEn: "Gauges" },
  { id: "engine", icon: "⚡", labelKo: "엔진", labelEn: "Engine" },
  { id: "odds", icon: "🎲", labelKo: "확률", labelEn: "Odds" },
  { id: "chart", icon: "📈", labelKo: "차트", labelEn: "Charts" },
  { id: "network", icon: "🌐", labelKo: "네트워크", labelEn: "Net" },
  { id: "more", icon: "ℹ️", labelKo: "안내", labelEn: "Info" },
];

export function BottomNav({
  tab,
  onChange,
  locale,
}: {
  tab: DashTab;
  onChange: (t: DashTab) => void;
  locale: string;
  /** @deprecated unused — link users never need bridge status lights */
  agentLive?: boolean;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-stone-700/90 bg-stone-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Main menu"
    >
      <div className="max-w-3xl mx-auto grid grid-cols-6 gap-0.5 px-1 pt-1.5 pb-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          const label = locale === "ko" ? t.labelKo : t.labelEn;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] rounded-xl transition-colors ${
                active
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-stone-500 hover:text-stone-300"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {t.icon}
              </span>
              <span className="text-[9px] font-medium tracking-tight leading-none">
                {label}
              </span>
              {active && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
