const NOTIFY_KEY = "solopulse:notify";

export type NotifyFailReason =
  | "unsupported"
  | "insecure"
  | "denied"
  | "default"
  | "ios-pwa"
  | "error";

export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    "Notification" in window
  );
}

export function isSecureNotifyContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = window.navigator as any;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

export function notificationsEnabled(): boolean {
  if (!notificationsSupported() || !isSecureNotifyContext()) return false;
  try {
    return (
      localStorage.getItem(NOTIFY_KEY) === "1" &&
      Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

export function getNotifyPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Promise + legacy callback requestPermission (Safari / older WebKit) */
async function requestPermissionCompat(): Promise<NotificationPermission> {
  try {
    const result = Notification.requestPermission();
    // Modern: returns Promise
    if (result != null && typeof (result as Promise<NotificationPermission>).then === "function") {
      return await (result as Promise<NotificationPermission>);
    }
  } catch {
    /* fall through to callback form */
  }
  return new Promise((resolve) => {
    try {
      // Legacy callback signature
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ret = (Notification as any).requestPermission(
        (p: NotificationPermission) => resolve(p || "default")
      );
      if (ret != null && typeof ret.then === "function") {
        ret.then((p: NotificationPermission) => resolve(p)).catch(() => resolve("default"));
      }
    } catch {
      resolve("default");
    }
  });
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    // Wait until active (max ~8s)
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    return (ready as ServiceWorkerRegistration) || reg || null;
  } catch {
    return null;
  }
}

export async function enableNotifications(): Promise<{
  ok: boolean;
  reason?: NotifyFailReason;
}> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unsupported" };
  }
  if (!isSecureNotifyContext()) {
    return { ok: false, reason: "insecure" };
  }
  if (!notificationsSupported()) {
    // iOS Safari in browser tab often has no Notification API
    if (isIosDevice() && !isStandalonePwa()) {
      return { ok: false, reason: "ios-pwa" };
    }
    return { ok: false, reason: "unsupported" };
  }

  // iOS: Web Notifications only reliable when added to Home Screen
  if (isIosDevice() && !isStandalonePwa()) {
    // Still try — iOS 16.4+ may allow in some builds; if not, guide user
    let perm = Notification.permission;
    if (perm === "default") {
      try {
        perm = await requestPermissionCompat();
      } catch {
        return { ok: false, reason: "ios-pwa" };
      }
    }
    if (perm !== "granted") {
      return { ok: false, reason: perm === "denied" ? "denied" : "ios-pwa" };
    }
  }

  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await requestPermissionCompat();
    } catch {
      return { ok: false, reason: "error" };
    }
  }

  if (perm === "granted") {
    try {
      localStorage.setItem(NOTIFY_KEY, "1");
    } catch {
      /* */
    }
    // Warm SW so showNotification works
    await ensureServiceWorker();
    return { ok: true };
  }

  try {
    localStorage.setItem(NOTIFY_KEY, "0");
  } catch {
    /* */
  }
  if (perm === "denied") return { ok: false, reason: "denied" };
  if (isIosDevice() && !isStandalonePwa()) return { ok: false, reason: "ios-pwa" };
  return { ok: false, reason: "default" };
}

export function disableNotifications() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFY_KEY, "0");
  } catch {
    /* */
  }
}

/**
 * Show system notification.
 * Prefer Service Worker (mobile + background-friendly), fallback to Notification constructor.
 */
export async function notifyAsync(
  title: string,
  body: string,
  tag?: string
): Promise<boolean> {
  if (!notificationsEnabled()) return false;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    tag: tag || "solopulse",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    renotify: Boolean(tag?.startsWith("block") || tag?.startsWith("temp")),
    requireInteraction: Boolean(
      tag?.startsWith("block") || tag?.startsWith("temp")
    ),
    data: { url: "/", tag: tag || "solopulse" },
  };

  // 1) Service Worker path
  try {
    const reg = await ensureServiceWorker();
    if (reg && typeof reg.showNotification === "function") {
      await reg.showNotification(title, options);
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([120, 60, 120]);
        }
      } catch {
        /* */
      }
      return true;
    }
  } catch {
    /* fall through */
  }

  // 2) Window Notification constructor
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* */
      }
    };
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([120, 60, 120]);
      }
    } catch {
      /* */
    }
    return true;
  } catch {
    return false;
  }
}

/** Sync wrapper for existing call sites (fire-and-forget) */
export function notify(title: string, body: string, tag?: string): boolean {
  if (!notificationsEnabled()) return false;
  void notifyAsync(title, body, tag);
  return true;
}

/** ASIC / board overheating threshold (°C) */
export const TEMP_HOT_C = 61;
/** Re-arm alert when temp cools below this (hysteresis) */
export const TEMP_CLEAR_C = 55;

/**
 * Fire once when temp crosses ≥ TEMP_HOT_C.
 * Re-arms after temp falls below TEMP_CLEAR_C so repeat spikes notify again.
 */
export function shouldNotifyTempHot(tempC: number): boolean {
  if (typeof window === "undefined") return false;
  if (!Number.isFinite(tempC)) return false;
  const armedKey = "solopulse:tempHotArmed";
  const armed = localStorage.getItem(armedKey) !== "0";

  if (tempC < TEMP_CLEAR_C) {
    localStorage.setItem(armedKey, "1");
    return false;
  }
  if (tempC >= TEMP_HOT_C && armed) {
    localStorage.setItem(armedKey, "0");
    return true;
  }
  return false;
}

export function notifyTempHot(tempC: number, model?: string) {
  const body =
    model && model.length
      ? `${model}: ${tempC.toFixed(1)}°C ≥ ${TEMP_HOT_C}°C — check cooling / airflow`
      : `Board ${tempC.toFixed(1)}°C ≥ ${TEMP_HOT_C}°C — check cooling / airflow`;
  return notify("🔥 SoloPulse — 기기 과열", body, "temp-hot");
}

/** Force system notification when user explicitly enabled (block found). */
export function notifyBlockFound(height: number | null, valueSats: number) {
  const btc = valueSats > 0 ? (valueSats / 1e8).toFixed(8) : null;
  const body =
    height != null
      ? `Block #${height}${btc ? ` · ${btc} BTC` : ""} — coinbase matched your address!`
      : `Block found!${btc ? ` · ${btc} BTC` : ""}`;
  return notify("🎉 BLOCK FOUND!", body, `block-${height ?? Date.now()}`);
}

export function shouldNotifyBestShare(best: number, networkDiff: number): boolean {
  if (typeof window === "undefined" || !notificationsEnabled()) return false;
  const key = "solopulse:lastBestNotified";
  const last = Number(localStorage.getItem(key) || "0");
  if (best <= last) return false;

  const ratio = best / networkDiff;
  const milestones = [0.001, 0.01, 0.1, 0.5, 1];
  const lastRatio = last / networkDiff;
  const crossed = milestones.some((m) => lastRatio < m && ratio >= m);
  if (crossed || best > last * 10) {
    localStorage.setItem(key, String(best));
    return true;
  }
  return false;
}

export function markBlockCelebrated(heightOrTx: string) {
  if (typeof window === "undefined") return;
  const list = JSON.parse(localStorage.getItem("solopulse:celebratedList") || "[]") as string[];
  if (!list.includes(heightOrTx)) {
    list.push(heightOrTx);
    localStorage.setItem("solopulse:celebratedList", JSON.stringify(list.slice(-50)));
  }
  localStorage.setItem("solopulse:celebrated", heightOrTx);
}

export function wasBlockCelebrated(heightOrTx: string): boolean {
  if (typeof window === "undefined") return true;
  if (localStorage.getItem("solopulse:celebrated") === heightOrTx) return true;
  try {
    const list = JSON.parse(localStorage.getItem("solopulse:celebratedList") || "[]") as string[];
    return list.includes(heightOrTx);
  } catch {
    return false;
  }
}
