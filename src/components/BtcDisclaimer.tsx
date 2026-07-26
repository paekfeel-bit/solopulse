"use client";

import { useI18n } from "@/lib/i18n";

/** Small persistent note: 100% contact ≠ confirmed BTC */
export function BtcDisclaimer({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const text =
    locale === "ko"
      ? "100% = BTC 확정이 아닙니다"
      : locale === "ja"
        ? "100% = BTC確定ではありません"
        : "100% ≠ BTC confirmed";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-600/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-500/90 leading-tight max-w-full ${className}`}
      title={
        locale === "ko"
          ? "성공 소스·합의 100%는 승자 조건 정렬일 뿐, 블록 발견 시에만 BTC"
          : locale === "ja"
            ? "ソース100%は条件整合のみ。BTCはブロック時のみ"
            : "Source 100% is condition alignment only; BTC only on block find"
      }
    >
      <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
