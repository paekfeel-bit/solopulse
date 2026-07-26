"use client";

import { useEffect, useState } from "react";

export type LinkStatus = "online" | "offline" | "degraded";

/**
 * Browser online status + optional API heartbeat.
 */
export function useOnlineStatus(heartbeatOk: boolean | null) {
  const [browserOnline, setBrowserOnline] = useState(true);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    setBrowserOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  let status: LinkStatus = "online";
  if (!browserOnline) status = "offline";
  else if (heartbeatOk === false) status = "degraded";
  else status = "online";

  return { status, browserOnline };
}
