"use client";

export type DashTab = "home" | "engine" | "odds" | "chart" | "bridge";

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
  { id: "bridge", icon: "🔗", labelKo: "브리지", labelEn: "Bridge" },
];

export function BottomNav({
  tab,
  onChange,
  locale,
  bridgeLive,
}: {
  tab: DashTab;
  onChange: (t: DashTab) => void;
  locale: string;
  /** Green when board bridge streaming */
  bridgeLive?: boolean;
  agentLive?: boolean;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-stone-700/90 bg-stone-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Main menu"
    >
      <div className="max-w-3xl mx-auto grid grid-cols-5 gap-0.5 px-1 pt-1.5 pb-1">
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
              {t.id === "bridge" && (
                <span
                  className={`absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full ${
                    bridgeLive ? "bg-emerald-400" : "bg-amber-500"
                  }`}
                />
              )}
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
