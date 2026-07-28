"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disableNotifications,
  enableNotifications,
  getNotifyPermission,
  isIosDevice,
  isStandalonePwa,
  notificationsEnabled,
  notifyAsync,
  TEMP_HOT_C,
  type NotifyFailReason,
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

function failMessage(locale: string, reason?: NotifyFailReason): string {
  if (locale === "ko") {
    switch (reason) {
      case "unsupported":
        return "이 브라우저는 알림을 지원하지 않습니다";
      case "insecure":
        return "HTTPS 환경에서만 알림을 켤 수 있습니다";
      case "denied":
        return "알림이 차단됨 · 주소창 자물쇠 → 사이트 설정 → 알림 허용";
      case "ios-pwa":
        return "iPhone: 공유 → 홈 화면에 추가 후, 홈에서 앱으로 열어 🔔를 다시 눌러 주세요";
      case "default":
        return "권한 창에서 ‘허용’을 선택해 주세요";
      default:
        return "알림을 켤 수 없습니다. 브라우저 권한을 확인해 주세요";
    }
  }
  if (locale === "ja") {
    switch (reason) {
      case "denied":
        return "通知が拒否されています。ブラウザ設定で許可してください";
      case "ios-pwa":
        return "iPhone: 共有→ホーム画面に追加してから再度🔔";
      default:
        return "通知を有効にできません";
    }
  }
  switch (reason) {
    case "unsupported":
      return "Notifications not supported in this browser";
    case "insecure":
      return "Notifications require HTTPS";
    case "denied":
      return "Blocked — open site settings (lock icon) → allow notifications";
    case "ios-pwa":
      return "iPhone: Share → Add to Home Screen, open from home, then tap 🔔 again";
    case "default":
      return "Choose Allow in the permission prompt";
    default:
      return "Could not enable notifications";
  }
}

/** SVG bell — orange when ON, dark when OFF */
export function NotifyBell() {
  const { t, locale } = useI18n();
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    setOn(notificationsEnabled());
  }, []);

  useEffect(() => {
    sync();
    const onVis = () => sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [sync]);

  function showToast(msg: string, ms = 4500) {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        disableNotifications();
        setOn(false);
        showToast(
          locale === "ko" ? "알림 꺼짐" : locale === "ja" ? "通知オフ" : "Notifications off"
        );
        return;
      }

      // Pre-hint for iOS Safari tab (most common “can't enable” case)
      if (isIosDevice() && !isStandalonePwa() && getNotifyPermission() !== "granted") {
        showToast(failMessage(locale, "ios-pwa"), 7000);
      }

      const res = await enableNotifications();
      if (res.ok) {
        setOn(true);
        const body = notifyCoverage(locale);
        const shown = await notifyAsync(
          locale === "ko" ? "SoloPulse — 알림 켜짐" : "SoloPulse — Alerts on",
          body,
          "notify-on"
        );
        showToast(
          shown
            ? locale === "ko"
              ? `알림 켜짐 ✓ · 테스트 알림 전송`
              : locale === "ja"
                ? `通知オン ✓ · テスト送信`
                : `Alerts on ✓ · test notification sent`
            : locale === "ko"
              ? `알림 권한 켜짐 · 테스트 표시는 브라우저가 막았을 수 있음`
              : `Permission granted · test toast may be blocked`,
          5000
        );
      } else {
        setOn(false);
        showToast(failMessage(locale, res.reason), 6500);
      }
    } catch {
      setOn(false);
      showToast(failMessage(locale, "error"));
    } finally {
      setBusy(false);
      sync();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggle();
        }}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? t("notifyOn") : t("notifyOff")}
        title={
          on
            ? `${t("notifyOn")} — ${notifyCoverage(locale)}`
            : `${t("notifyOff")} — ${
                locale === "ko"
                  ? "탭하여 켜기 (블록·셰어·소스·과열)"
                  : "Tap to enable alerts"
              }`
        }
        className={`inline-flex items-center justify-center h-9 w-9 min-h-[2.25rem] min-w-[2.25rem] shrink-0 rounded-lg border transition active:scale-95 touch-manipulation ${
          on
            ? "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/40"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-amber-600/50"
        } ${busy ? "opacity-60 pointer-events-none" : ""}`}
      >
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
        <div
          role="status"
          className="absolute right-0 top-full mt-1.5 z-[80] w-[min(18rem,calc(100vw-2rem))] text-left rounded-lg bg-zinc-900 text-white text-[11px] leading-snug px-3 py-2 shadow-lg border border-zinc-600 break-words"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
