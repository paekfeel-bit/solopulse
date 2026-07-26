const NOTIFY_KEY = "solopulse:notify";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled(): boolean {
  if (!notificationsSupported()) return false;
  return localStorage.getItem(NOTIFY_KEY) === "1" && Notification.permission === "granted";
}

export function getNotifyPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function enableNotifications(): Promise<{
  ok: boolean;
  reason?: "unsupported" | "denied" | "default";
}> {
  if (!notificationsSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return { ok: false, reason: "denied" };
    }
  }
  if (perm === "granted") {
    localStorage.setItem(NOTIFY_KEY, "1");
    return { ok: true };
  }
  localStorage.setItem(NOTIFY_KEY, "0");
  return { ok: false, reason: perm === "denied" ? "denied" : "default" };
}

export function disableNotifications() {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFY_KEY, "0");
}

export function notify(title: string, body: string, tag?: string) {
  if (!notificationsEnabled()) return false;
  try {
    new Notification(title, {
      body,
      tag: tag || "solopulse",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      requireInteraction:
        (tag?.startsWith("block") || tag?.startsWith("temp")) ?? false,
    });
    // Optional short vibration on mobile when supported
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
