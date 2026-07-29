import { NextRequest, NextResponse } from "next/server";
import { LIGHTNING_TIP_ADDRESS } from "@/lib/clipboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve Lightning Address (LUD-16) → BOLT11 invoice via LNURL-pay.
 * Query: amountSats (default 1000), address optional override.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const address = (sp.get("address") || LIGHTNING_TIP_ADDRESS).trim();
    const amountSats = Math.max(
      1,
      Math.min(1_000_000, Number(sp.get("amountSats") || 1000) || 1000)
    );

    const at = address.indexOf("@");
    if (at < 1) {
      return NextResponse.json(
        { error: "Invalid Lightning address" },
        { status: 400 }
      );
    }
    const user = encodeURIComponent(address.slice(0, at));
    const domain = address.slice(at + 1);

    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${user}`;
    const metaRes = await fetch(lnurlpUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!metaRes.ok) {
      return NextResponse.json(
        {
          error: `LNURL-pay lookup failed (${metaRes.status})`,
          address,
          fallback: address,
        },
        { status: 502 }
      );
    }
    const meta = (await metaRes.json()) as {
      callback?: string;
      minSendable?: number;
      maxSendable?: number;
      tag?: string;
      status?: string;
      reason?: string;
    };
    if (meta.status === "ERROR" || !meta.callback) {
      return NextResponse.json(
        {
          error: meta.reason || "No LNURL-pay callback",
          address,
          fallback: address,
        },
        { status: 502 }
      );
    }

    const minSats = Math.ceil((meta.minSendable || 1000) / 1000);
    const maxSats = Math.floor((meta.maxSendable || 1e12) / 1000);
    const sats = Math.max(minSats, Math.min(maxSats, amountSats));
    const amountMsats = sats * 1000;

    const cb = new URL(meta.callback);
    cb.searchParams.set("amount", String(amountMsats));

    const invRes = await fetch(cb.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!invRes.ok) {
      return NextResponse.json(
        {
          error: `Invoice request failed (${invRes.status})`,
          address,
          fallback: address,
        },
        { status: 502 }
      );
    }
    const inv = (await invRes.json()) as {
      pr?: string;
      status?: string;
      reason?: string;
    };
    if (!inv.pr || inv.status === "ERROR") {
      return NextResponse.json(
        {
          error: inv.reason || "No BOLT11 in response",
          address,
          fallback: address,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      address,
      amountSats: sats,
      bolt11: inv.pr,
      qrPayload: inv.pr,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invoice error";
    return NextResponse.json(
      {
        error: msg,
        address: LIGHTNING_TIP_ADDRESS,
        fallback: LIGHTNING_TIP_ADDRESS,
      },
      { status: 500 }
    );
  }
}
