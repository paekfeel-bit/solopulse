"use client";

import { useRef, useState } from "react";
import { copyText, LIGHTNING_TIP_ADDRESS } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";

type Variant = "header" | "pill" | "gate";

const styles: Record<Variant, string> = {
  header:
    "inline-flex items-center justify-center h-8 max-w-[11rem] sm:max-w-[14rem] px-2.5 text-[10px] rounded-lg border border-amber-500/40 text-amber-500 font-mono truncate shrink-0 leading-none cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:text-amber-200 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.5)] " +
    "active:bg-amber-500/30 active:shadow-[0_0_18px_4px_rgba(253,224,71,0.55)]",
  pill:
    "inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] font-mono text-amber-500 cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.45)] " +
    "active:bg-amber-500/30",
  gate:
    "flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 px-3 text-[11px] font-mono text-amber-500 cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.45)] " +
    "active:bg-amber-500/30",
};

/** Tap/click → copy Lightning address. Labeled as developer tip. */
export function LightningTip({
  variant = "header",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const { locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);

  const sponsor =
    locale === "ko" ? "개발자 후원주소" : locale === "ja" ? "開発者支援" : "Dev tip address";

  async function onCopy() {
    if (lock.current) return;
    lock.current = true;
    const ok = await copyText(LIGHTNING_TIP_ADDRESS);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
    window.setTimeout(() => {
      lock.current = false;
    }, 400);
  }

  const addrLabel = copied
    ? locale === "ko"
      ? "✓ 복사됨"
      : "✓ Copied"
    : LIGHTNING_TIP_ADDRESS;

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={() => void onCopy()}
        className={`${styles.header} ${className}`}
        title={
          locale === "ko"
            ? "개발자 후원주소 — 탭하면 Lightning 주소 복사"
            : "Developer tip — tap to copy Lightning address"
        }
        aria-label={
          locale === "ko"
            ? "개발자 후원 Lightning 주소 복사"
            : "Copy developer Lightning tip address"
        }
      >
        <span className="flex flex-col items-start min-w-0 leading-tight py-0.5">
          <span className="text-[8px] uppercase tracking-wide text-amber-600/90 font-sans font-semibold">
            {sponsor}
          </span>
          <span className="truncate max-w-[10.5rem] sm:max-w-[13rem]">{addrLabel}</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`${styles[variant]} ${className}`}
      title={
        locale === "ko"
          ? "개발자 후원주소 — 탭하면 복사"
          : "Developer tip — tap to copy"
      }
      aria-label={
        locale === "ko"
          ? "개발자 후원 Lightning 주소 복사"
          : "Copy developer Lightning tip address"
      }
    >
      <span className="text-[9px] uppercase tracking-wide font-sans font-semibold text-amber-600/90">
        {sponsor}
      </span>
      <span>⚡ {addrLabel}</span>
    </button>
  );
}
