"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { copyText, LIGHTNING_TIP_ADDRESS } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";

type Variant = "header" | "pill" | "gate";

const styles: Record<Variant, string> = {
  header:
    "inline-flex items-center justify-center h-8 max-w-[11rem] sm:max-w-[14rem] px-2.5 text-[10px] rounded-lg border border-amber-500/40 text-amber-500 font-mono truncate shrink-0 leading-none cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:text-amber-200 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.5)] " +
    "active:bg-amber-500/30 active:shadow-[0_0_18px_4px_rgba(253,224,71,0.55)]",
  pill:
    "inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] font-mono text-amber-500 cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.45)] " +
    "active:bg-amber-500/30",
  gate:
    "flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 px-3 text-[11px] font-mono text-amber-500 cursor-pointer select-none transition-all duration-150 " +
    "hover:border-amber-300 hover:bg-amber-500/20 hover:shadow-[0_0_14px_2px_rgba(250,204,21,0.45)] " +
    "active:bg-amber-500/30",
};

const AMOUNTS = [100, 1000, 5000, 21000] as const;

/** Tap → copy Lightning address + open invoice QR modal. */
export function LightningTip({
  variant = "header",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const { locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [amountSats, setAmountSats] = useState(1000);
  const [bolt11, setBolt11] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lock = useRef(false);

  const sponsor =
    locale === "ko" ? "개발자 후원주소" : locale === "ja" ? "開発者支援" : "Dev tip address";

  const makeQr = useCallback(async (payload: string) => {
    try {
      const url = await QRCode.toDataURL(payload, {
        width: 240,
        margin: 2,
        color: { dark: "#18181b", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

  const fetchInvoice = useCallback(
    async (sats: number) => {
      setLoading(true);
      setErr(null);
      setBolt11(null);
      try {
        const res = await fetch(
          `/api/lightning/invoice?amountSats=${sats}&address=${encodeURIComponent(LIGHTNING_TIP_ADDRESS)}`,
          { cache: "no-store" }
        );
        const j = (await res.json()) as {
          ok?: boolean;
          bolt11?: string;
          qrPayload?: string;
          error?: string;
          fallback?: string;
        };
        if (j.bolt11) {
          setBolt11(j.bolt11);
          await makeQr(j.bolt11);
        } else {
          // Fallback: QR of lightning address (wallets that support LN address scan)
          setErr(j.error || "Invoice unavailable");
          const fallback = j.fallback || LIGHTNING_TIP_ADDRESS;
          setBolt11(null);
          await makeQr(`lightning:${fallback}`);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "network error");
        await makeQr(`lightning:${LIGHTNING_TIP_ADDRESS}`);
      } finally {
        setLoading(false);
      }
    },
    [makeQr]
  );

  useEffect(() => {
    if (!open) return;
    void fetchInvoice(amountSats);
  }, [open, amountSats, fetchInvoice]);

  async function onOpen() {
    if (lock.current) return;
    lock.current = true;
    const ok = await copyText(LIGHTNING_TIP_ADDRESS);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
    setOpen(true);
    window.setTimeout(() => {
      lock.current = false;
    }, 400);
  }

  async function copyInvoice() {
    const text = bolt11 || LIGHTNING_TIP_ADDRESS;
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  const addrLabel = copied
    ? locale === "ko"
      ? "✓ 복사됨"
      : "✓ Copied"
    : LIGHTNING_TIP_ADDRESS;

  const modal = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={locale === "ko" ? "라이트닝 후원 인보이스" : "Lightning tip invoice"}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-[var(--card)] text-[var(--fg)] shadow-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500 font-semibold">
              Lightning · Tip
            </div>
            <h3 className="text-sm font-bold mt-0.5">
              {locale === "ko" ? "개발자 후원" : "Developer tip"}
            </h3>
            <p className="text-[10px] font-mono text-[var(--muted)] mt-1 break-all">
              {LIGHTNING_TIP_ADDRESS}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[var(--muted)] hover:text-[var(--fg)] text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmountSats(a)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border transition ${
                amountSats === a
                  ? "border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-300"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-amber-500/50"
              }`}
            >
              {a.toLocaleString()} sats
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          {loading && (
            <div className="h-[200px] w-[200px] flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            </div>
          )}
          {!loading && qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Lightning invoice QR"
              width={200}
              height={200}
              className="rounded-lg bg-white"
            />
          )}
          {!loading && !qrDataUrl && (
            <div className="h-[200px] w-[200px] flex items-center justify-center text-xs text-[var(--muted)]">
              QR —
            </div>
          )}
          <div className="text-[10px] text-center text-[var(--muted)]">
            {bolt11
              ? locale === "ko"
                ? `인보이스 ${amountSats.toLocaleString()} sats · 지갑으로 스캔`
                : `Invoice ${amountSats.toLocaleString()} sats · scan with wallet`
              : locale === "ko"
                ? "주소 QR (인보이스 대체) · 지갑으로 스캔"
                : "Address QR (fallback) · scan with wallet"}
          </div>
          {err && (
            <div className="text-[9px] text-amber-600 dark:text-amber-400 text-center max-w-full break-words">
              {err}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copyInvoice()}
            className="flex-1 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs py-2.5"
          >
            {copied
              ? locale === "ko"
                ? "✓ 복사됨"
                : "✓ Copied"
              : bolt11
                ? locale === "ko"
                  ? "인보이스 복사"
                  : "Copy invoice"
                : locale === "ko"
                  ? "주소 복사"
                  : "Copy address"}
          </button>
          <button
            type="button"
            onClick={() => void fetchInvoice(amountSats)}
            className="rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--muted)]"
          >
            {locale === "ko" ? "재발급" : "Refresh"}
          </button>
        </div>
        <p className="text-[9px] text-center text-[var(--muted)] leading-relaxed">
          {locale === "ko"
            ? "주소는 클릭 시 자동 복사됩니다. 인보이스는 LNURL-pay로 생성됩니다."
            : "Address is copied on open. Invoice is created via LNURL-pay."}
        </p>
      </div>
    </div>
  ) : null;

  if (variant === "header") {
    return (
      <>
        <button
          type="button"
          onClick={() => void onOpen()}
          className={`${styles.header} ${className}`}
          title={
            locale === "ko"
              ? "개발자 후원 — 복사 + 인보이스 QR"
              : "Developer tip — copy + invoice QR"
          }
          aria-label={
            locale === "ko"
              ? "개발자 후원 Lightning 인보이스"
              : "Developer Lightning tip invoice"
          }
        >
          <span className="flex flex-col items-start min-w-0 leading-tight py-0.5">
            <span className="text-[8px] uppercase tracking-wide text-amber-600/90 font-sans font-semibold">
              {sponsor}
            </span>
            <span className="truncate max-w-[10.5rem] sm:max-w-[13rem]">{addrLabel}</span>
          </span>
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onOpen()}
        className={`${styles[variant]} ${className}`}
        title={
          locale === "ko"
            ? "개발자 후원 — 복사 + 인보이스 QR"
            : "Developer tip — copy + invoice QR"
        }
        aria-label={
          locale === "ko"
            ? "개발자 후원 Lightning 인보이스"
            : "Developer Lightning tip invoice"
        }
      >
        <span className="text-[9px] uppercase tracking-wide font-sans font-semibold text-amber-600/90">
          {sponsor}
        </span>
        <span>⚡ {addrLabel}</span>
      </button>
      {modal}
    </>
  );
}
