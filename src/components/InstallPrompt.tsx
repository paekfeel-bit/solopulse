"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setStandalone(isStandalone);

    const ua = navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS && !isStandalone) setIosHint(true);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (standalone || dismissed) return null;
  if (!deferred && !iosHint) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 max-w-md mx-auto">
      <div className="rounded-2xl border border-amber-700/40 bg-[var(--header)] backdrop-blur-md shadow-2xl p-3 sm:p-4 flex gap-3 items-start">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shrink-0 text-lg">
          ⚡
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--fg)]">{t("installHint")}</div>
          {deferred ? (
            <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
              PWA · SoloPulse
            </p>
          ) : (
            <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
              {t("iosInstall")}
            </p>
          )}
          <div className="flex gap-2 mt-2.5">
            {deferred && (
              <button
                type="button"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-zinc-950"
                onClick={async () => {
                  await deferred.prompt();
                  setDeferred(null);
                  setDismissed(true);
                }}
              >
                {t("installBtn")}
              </button>
            )}
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)]"
              onClick={() => setDismissed(true)}
            >
              {t("later")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
