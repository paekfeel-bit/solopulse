"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getStoredAddress,
  getStoredDeviceIp,
  getStoredPool,
  setStoredDeviceIp,
} from "@/lib/history";
import { HUB_LINKS, resolveHref, type HubContext } from "@/lib/hubLinks";
import { useI18n, localeButtonLabel } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { BtcDisclaimer } from "@/components/BtcDisclaimer";
import { formatHashrateGhs } from "@/lib/mining";

type RemoteStatus = {
  deviceOnline: boolean;
  deviceGhs: number | null;
  deviceModel: string | null;
  pool1m: string | null;
  pool5m: string | null;
  lastShare: number | null;
  error?: string;
};

export default function HubPage() {
  const { locale, cycleLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const [address, setAddress] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [pool, setPool] = useState("solo.ckpool.org");
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setAddress(getStoredAddress() || "");
    setDeviceIp(getStoredDeviceIp());
    setPool(getStoredPool());
  }, []);

  const ctx: HubContext = useMemo(
    () => ({ address, deviceIp, pool }),
    [address, deviceIp, pool]
  );

  async function refreshRemote() {
    setRefreshing(true);
    try {
      const status: RemoteStatus = {
        deviceOnline: false,
        deviceGhs: null,
        deviceModel: null,
        pool1m: null,
        pool5m: null,
        lastShare: null,
      };

      if (deviceIp.trim()) {
        try {
          const d = await fetch(
            `/api/device?ip=${encodeURIComponent(deviceIp.trim())}&_=${Date.now()}`,
            { cache: "no-store" }
          ).then((r) => r.json());
          if (d.online) {
            status.deviceOnline = true;
            status.deviceGhs = d.hashRateGhs;
            status.deviceModel = d.deviceModel;
          } else {
            status.error = d.error || "device offline";
          }
        } catch {
          status.error = "device unreachable";
        }
      }

      if (address.trim()) {
        try {
          const m = await fetch(
            `/api/miner/${encodeURIComponent(address.trim())}?pool=${encodeURIComponent(pool)}&_=${Date.now()}`,
            { cache: "no-store" }
          ).then((r) => r.json());
          if (m.user) {
            status.pool1m = m.user.hashrate1m;
            status.pool5m = m.user.hashrate5m;
            status.lastShare = m.user.lastshare;
          }
        } catch {
          /* */
        }
      }

      setRemote(status);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refreshRemote();
    const id = setInterval(refreshRemote, 2_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, deviceIp, pool]);

  const categories = [
    { id: "device", ko: "내 기기", en: "My device", ja: "マイ機器" },
    { id: "pool", ko: "풀", en: "Pools", ja: "プール" },
    { id: "explorer", ko: "탐색기", en: "Explorer", ja: "エクスプローラー" },
    { id: "stats", ko: "통계", en: "Stats", ja: "統計" },
    { id: "tools", ko: "도구", en: "Tools", ja: "ツール" },
  ] as const;

  function catLabel(id: string) {
    const c = categories.find((x) => x.id === id);
    if (!c) return id;
    return locale === "ko" ? c.ko : locale === "ja" ? c.ja : c.en;
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] pb-20">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-sm shrink-0"
            >
              ⚡
            </Link>
            <div className="min-w-0">
              <div className="text-sm font-bold">
                {locale === "ko" ? "마이닝 허브" : "Mining Hub"}
              </div>
              <div className="text-[10px] text-[var(--muted)] truncate">
                {locale === "ko"
                  ? "기기·풀·탐색기 원탭"
                  : "Device · pool · explorer"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <BtcDisclaimer className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={cycleLocale}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)]"
            >
              {localeButtonLabel(locale)}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)]"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <Link
              href="/"
              className="text-[10px] px-2 py-1 rounded-lg border border-amber-500/40 text-amber-400"
            >
              {locale === "ko" ? "대시보드" : "Dashboard"}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 pt-4 space-y-4">
        {/* Remote status — works on LTE if SoloPulse server can reach device/pool */}
        <section className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold">
              {locale === "ko"
                ? "원격 상태 (LTE/5G 가능)"
                : "Remote status (works on LTE)"}
            </h2>
            <button
              type="button"
              onClick={() => void refreshRemote()}
              className={`text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] ${
                refreshing ? "animate-spin" : ""
              }`}
            >
              ↻
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted)] mb-3 leading-relaxed">
            {locale === "ko"
              ? "집 PC에서 SoloPulse 서버가 켜져 있고 공개 링크로 접속하면, 휴대폰 데이터만으로도 풀·기기(서버가 LAN 접근 가능 시) 상태를 볼 수 있습니다. 기기 홈 iframe은 집 와이파이에서만 직접 열립니다."
              : "With SoloPulse running at home + public URL, mobile data can show pool & device status (if server reaches LAN). Direct device iframe needs home Wi‑Fi."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="text-[9px] uppercase text-[var(--muted)]">Device</div>
              <div
                className={`text-sm font-mono font-bold ${
                  remote?.deviceOnline ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {remote?.deviceOnline
                  ? formatHashrateGhs((remote.deviceGhs || 0) * 1e9, 2)
                  : "OFFLINE"}
              </div>
              <div className="text-[10px] text-[var(--muted)] truncate">
                {remote?.deviceModel || deviceIp || "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="text-[9px] uppercase text-[var(--muted)]">
                {remote?.deviceOnline ? "Pool (ref)" : "Pool 1m live"}
              </div>
              <div className="text-sm font-mono font-bold text-amber-400">
                {remote?.pool1m || remote?.pool5m || "—"}
              </div>
              <div className="text-[10px] text-[var(--muted)]">
                1m {remote?.pool1m || "—"} · 5m {remote?.pool5m || "—"}
                {remote?.lastShare
                  ? ` · share ${Math.max(0, Math.floor(Date.now() / 1000 - remote.lastShare))}s`
                  : ""}
              </div>
            </div>
          </div>
          {remote?.error && (
            <p className="mt-2 text-[10px] text-amber-500">{remote.error}</p>
          )}
        </section>

        {/* Quick settings */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
          <div className="text-xs font-semibold mb-1">
            {locale === "ko" ? "허브 설정" : "Hub settings"}
          </div>
          <input
            className="w-full text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            placeholder="BTC address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="Device IP e.g. 172.30.1.97"
              value={deviceIp}
              onChange={(e) => setDeviceIp(e.target.value)}
            />
            <button
              type="button"
              className="text-[10px] px-3 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40"
              onClick={() => {
                setStoredDeviceIp(deviceIp.trim());
                void refreshRemote();
              }}
            >
              {locale === "ko" ? "저장" : "Save"}
            </button>
          </div>
        </section>

        {/* Embed viewer */}
        {embedUrl && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <span className="text-[10px] font-mono truncate max-w-[70%]">{embedUrl}</span>
              <div className="flex gap-1">
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border)]"
                >
                  ↗
                </a>
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border)]"
                  onClick={() => setEmbedUrl(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={embedUrl}
              title="hub-embed"
              className="w-full h-[70vh] bg-black"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </section>
        )}

        {/* Link grid by category */}
        {categories.map((cat) => {
          const links = HUB_LINKS.filter((l) => l.category === cat.id);
          if (!links.length) return null;
          return (
            <section key={cat.id} className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                {catLabel(cat.id)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {links.map((link) => {
                  const href = resolveHref(link, ctx);
                  const disabled = href === "#" || (link.lanOnly && !deviceIp);
                  return (
                    <div
                      key={link.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{link.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">
                            {locale === "ko" ? link.titleKo : link.title}
                          </div>
                          <div className="text-[10px] text-[var(--muted)] leading-snug">
                            {locale === "ko" ? link.descKo : link.desc}
                            {link.lanOnly && (
                              <span className="text-amber-500"> · LAN</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <a
                          href={disabled ? undefined : href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex-1 text-center text-[11px] font-semibold py-1.5 rounded-lg ${
                            disabled
                              ? "bg-zinc-800 text-zinc-500 pointer-events-none"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          }`}
                        >
                          {locale === "ko" ? "새 탭" : "Open"}
                        </a>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setEmbedUrl(href)}
                          className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] disabled:opacity-40"
                        >
                          {locale === "ko" ? "앱 안 보기" : "Embed"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="text-[10px] text-center text-[var(--muted)] leading-relaxed pb-4">
          {locale === "ko"
            ? "제3자 배포: 이 SoloPulse 공개 URL을 공유하면 풀 추적은 전 세계 가능. 기기 실측은 홈 서버가 LAN의 마이너에 닿을 때만."
            : "Public deploy: share SoloPulse URL for global pool tracking. Device live needs home server → LAN miner."}
        </p>
      </main>
    </div>
  );
}
