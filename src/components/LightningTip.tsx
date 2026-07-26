"use client";

import { useRef, useState } from "react";
import { copyText, LIGHTNING_TIP_ADDRESS } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";

type Variant = "header" | "pill" | "gate";

const styles: Record<Variant, string> = {
  header:
    "inline-flex items-center justify-center h-8 max-w-[12rem] sm:max-w-none px-2.5 text-[10px] rounded-lg border border-amber-500/35 text-amber-400/95 font-mono truncate shrink-0 leading-none cursor-pointer hover:bg-amber-500/10 active:scale-[0.98] select-none",
  pill:
    "inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-[11px] font-mono text-amber-400 hover:bg-amber-500/15 cursor-pointer active:scale-[0.98] select-none",
  gate:
    "flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 py-2.5 px-3 text-[11px] font-mono text-amber-400 hover:bg-amber-500/15 transition cursor-pointer active:scale-[0.98] select-none",
};

/** Tap/click → copy Lightning address immediately (mobile + PC). */
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

  const label = copied
    ? locale === "ko"
      ? "✓ 복사됨"
      : "✓ Copied"
    : variant === "header"
      ? LIGHTNING_TIP_ADDRESS
      : `⚡ ${LIGHTNING_TIP_ADDRESS}`;

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`${styles[variant]} ${className}`}
      title={
        locale === "ko"
          ? "탭하면 Lightning 후원 주소가 복사됩니다"
          : "Tap to copy Lightning tip address"
      }
      aria-label={
        locale === "ko"
          ? "개발자 후원 Lightning 주소 복사"
          : "Copy developer Lightning tip address"
      }
    >
      {label}
    </button>
  );
}
