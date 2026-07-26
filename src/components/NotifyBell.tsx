"use client";

import { useEffect, useState } from "react";
import {
  disableNotifications,
  enableNotifications,
  getNotifyPermission,
  notificationsEnabled,
  notify,
  TEMP_HOT_C,
} from "@/lib/notify";
import { useI18n } from "@/lib/i18n";

function notifyCoverage(locale: string): string {
  if (locale === "ko") {
    return `알림 대상: 블록 발견 · 강한 셰어 · 소스 90%+ · 기기 과열(≥${TEMP_HOT_C}°C)`;
  }
  if (locale === "ja") {
    return `通知: ブロック発見 · 強シェア · ソース90%+ · 機器過熱(≥${TEMP_HOT_C}°C)`;
  }
  return `Alerts: block found · strong share · source 90%+ · board overheat (≥${TEMP_HOT_C}°C)`;
}

/** SVG bell — orange when ON, black/dark when OFF */
export function NotifyBell() {
  const { t, locale } = useI18n();
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(notificationsEnabled());
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3800);
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        disableNotifications();
        setOn(false);
        showToast(
          locale === "ko"
            ? "알림 꺼짐"
            : locale === "ja"
              ? "通知オフ"
              : "Notifications off"
        );
      } else {
        const res = await enableNotifications();
        if (res.ok) {
          setOn(true);
          const body = notifyCoverage(locale);
          notify("SoloPulse — 알림 켜짐", body, "notify-on");
          showToast(
            locale === "ko"
              ? `알림 켜짐 ✓ · 과열≥${TEMP_HOT_C}°C 포함`
              : locale === "ja"
                ? `通知オン ✓ · 過熱≥${TEMP_HOT_C}°C`
                : `Alerts on ✓ · overheat ≥${TEMP_HOT_C}°C`
          );
        } else {
          setOn(false);
          const perm = getNotifyPermission();
          if (res.reason === "unsupported") {
            showToast(
              locale === "ko"
                ? "이 브라우저는 알림 미지원"
                : locale === "ja"
                  ? "このブラウザは通知非対応"
                  : "Notifications not supported"
            );
          } else if (perm === "denied" || res.reason === "denied") {
            showToast(
              locale === "ko"
                ? "브라우저 설정에서 알림을 허용하세요"
                : locale === "ja"
                  ? "ブラウザ設定で通知を許可してください"
                  : "Allow notifications in browser settings"
            );
          } else {
            showToast(
              locale === "ko"
                ? "알림 권한이 필요합니다"
                : locale === "ja"
                  ? "通知の許可が必要です"
                  : "Permission required"
            );
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? t("notifyOn") : t("notifyOff")}
        title={
          on
            ? `${t("notifyOn")} — ${notifyCoverage(locale)}`
            : `${t("notifyOff")} — ${
                locale === "ko"
                  ? "탭하여 켜기 (블록·셰어·소스·과열)"
                  : locale === "ja"
                    ? "タップでオン（ブロック・シェア・ソース・過熱）"
                    : "Tap to enable (block · share · source · overheat)"
              }`
        }
        className={`inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg border transition active:scale-95 ${
          on
            ? "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/40"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
        } ${busy ? "opacity-60" : ""}`}
      >
        {/* Bell SVG */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M12 3a5 5 0 0 0-5 5v2.5c0 .7-.2 1.4-.6 2L5.2 14.7A1 1 0 0 0 6 16.2h12a1 1 0 0 0 .8-1.5l-1.2-2.2c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z"
            fill={on ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 18a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {toast && (
        <div className="absolute right-0 top-full mt-1 z-50 max-w-[16rem] sm:max-w-xs text-right rounded-lg bg-zinc-900 text-white text-[10px] leading-snug px-2.5 py-1.5 shadow-lg border border-zinc-700 break-words">
          {toast}
        </div>
      )}
    </div>
  );
}
