"use client";

import { useEffect, useState } from "react";
import { isValidBtcAddress, normalizeBtcAddress } from "@/lib/mining";
import {
  setStoredAddress,
  setStoredPool,
  getStoredPool,
  getStoredDeviceIp,
  setStoredDeviceIp,
  getLastAddress,
  rememberLastAddress,
  normalizeDeviceHost,
} from "@/lib/history";
import { POOL_OPTIONS } from "@/lib/pools";
import { useI18n, localeButtonLabel } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { ConnectionLight } from "./ConnectionLight";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { BtcDisclaimer } from "./BtcDisclaimer";
import { LightningTip } from "./LightningTip";

interface Props {
  onSubmit: (address: string) => void;
  defaultAddress?: string;
}

export function AddressGate({ onSubmit, defaultAddress = "" }: Props) {
  const { t, locale, cycleLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const { status } = useOnlineStatus(true);
  const [address, setAddress] = useState(() => {
    if (typeof window === "undefined") return defaultAddress || "";
    return defaultAddress || getLastAddress() || "";
  });
  const [pool, setPool] = useState(() => {
    if (typeof window === "undefined") return "solo.ckpool.org";
    return getStoredPool() || "solo.ckpool.org";
  });
  const [deviceIp, setDeviceIp] = useState(() => {
    if (typeof window === "undefined") return "auto";
    return getStoredDeviceIp() || "auto";
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = (defaultAddress || getLastAddress()).trim();
    if (remembered) setAddress(remembered);
  }, [defaultAddress]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const a = normalizeBtcAddress(address);
    if (!isValidBtcAddress(a)) {
      setError(t("invalidAddress"));
      return;
    }
    setError(null);
    setStoredAddress(a);
    rememberLastAddress(a);
    setStoredPool(pool);
    const host = normalizeDeviceHost(deviceIp) || deviceIp.trim() || "auto";
    setStoredDeviceIp(host === "bridge" ? "auto" : host);
    onSubmit(a);
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 sm:px-5 py-8 sm:py-10 bg-[var(--bg)] text-[var(--fg)] overflow-x-clip">
      <div className="w-full max-w-md min-w-0">
        <div className="flex items-center justify-between mb-6">
          <ConnectionLight status={status} />
          <div className="flex items-center gap-2">
            <BtcDisclaimer />
            <button
              type="button"
              onClick={cycleLocale}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] min-w-[2rem]"
              title={locale}
            >
              {localeButtonLabel(locale)}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)]"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-600/30 mb-5">
            <span className="text-3xl" aria-hidden>
              ⚡
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Solo<span className="text-amber-500">Pulse</span>
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{t("tagline")}</p>
          <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
            {locale === "ko"
              ? "주소 + (선택) 기기 IP · auto 로 자동 검색"
              : "Address + optional miner IP · auto scan"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] backdrop-blur p-6 shadow-xl space-y-5"
        >
          <div>
            <label
              htmlFor="address"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2"
            >
              {t("addressLabel")}
            </label>
            <input
              id="address"
              type="text"
              autoComplete="on"
              name="btc-address"
              spellCheck={false}
              placeholder="bc1q… / 1… / 3…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none px-4 py-3.5 text-sm font-mono text-[var(--fg)] placeholder:text-[var(--muted)] transition"
            />
          </div>

          <div>
            <label
              htmlFor="pool"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2"
            >
              {t("poolLabel")}
            </label>
            <select
              id="pool"
              value={pool}
              onChange={(e) => setPool(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-amber-500 outline-none px-4 py-3 text-sm text-[var(--fg)]"
            >
              {POOL_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="deviceIp"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2"
            >
              {t("deviceIp")}{" "}
              <span className="normal-case font-normal opacity-70">
                ({locale === "ko" ? "보드 실측 · auto 가능" : "board · auto ok"})
              </span>
            </label>
            <input
              id="deviceIp"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="auto 또는 172.30.1.33"
              value={deviceIp}
              onChange={(e) => setDeviceIp(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-amber-500 outline-none px-4 py-3 text-sm font-mono text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDeviceIp("auto")}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-amber-600/50 bg-amber-500/10 text-amber-400"
              >
                {locale === "ko" ? "auto (자동)" : "auto"}
              </button>
              {["172.30.1.33", "172.30.1.70", "172.30.1.56", "192.168.1.45"].map(
                (ip) => (
                  <button
                    key={ip}
                    type="button"
                    onClick={() => setDeviceIp(ip)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] font-mono"
                  >
                    {ip.split(".").slice(-2).join(".")}
                  </button>
                )
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--muted)] leading-relaxed">
              {locale === "ko"
                ? "auto = 서버/브리지 자동 검색. 집 LAN이면 IP 직접 입력. 대시보드에서도 변경·재검색 가능."
                : "auto = scan via server/bridge. Or type LAN IP. Editable again on dashboard."}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 font-semibold py-3.5 text-sm transition shadow-lg shadow-orange-600/20 active:scale-[0.99]"
          >
            {t("openDashboard")}
          </button>
        </form>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
          <a
            href="https://x.com/medbedeee"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 px-3 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition"
          >
            𝕏 {t("feedback")}
          </a>
          <LightningTip variant="gate" />
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--muted)] leading-relaxed">
          {t("chanceExplain")}
        </p>
      </div>
    </div>
  );
}
