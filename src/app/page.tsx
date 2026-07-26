"use client";

import { useEffect, useState } from "react";
import { AddressGate } from "@/components/AddressGate";
import { Dashboard } from "@/components/Dashboard";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  clearStoredAddress,
  getLastAddress,
  getStoredAddress,
  rememberLastAddress,
} from "@/lib/history";

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [lastPrefill, setLastPrefill] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Session address → go straight to dashboard
    const stored = getStoredAddress();
    // Always load last used for gate prefill
    const last = getLastAddress();
    setLastPrefill(last);
    if (stored) {
      setAddress(stored);
      rememberLastAddress(stored);
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!address) {
    return (
      <>
        <AddressGate
          key={lastPrefill || "gate"}
          defaultAddress={lastPrefill}
          onSubmit={(a) => {
            rememberLastAddress(a);
            setLastPrefill(a);
            setAddress(a);
          }}
        />
        <InstallPrompt />
      </>
    );
  }

  return (
    <>
      <Dashboard
        address={address}
        onLogout={() => {
          // Remember for next login screen, clear only session
          rememberLastAddress(address);
          setLastPrefill(address);
          clearStoredAddress();
          setAddress(null);
        }}
      />
      <InstallPrompt />
    </>
  );
}
