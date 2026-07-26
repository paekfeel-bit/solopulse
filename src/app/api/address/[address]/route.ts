import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Detect recent coinbase payouts to the mining address (block found).
 * mempool.space address txs — coinbase vout matching address.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  let addr = decodeURIComponent(address).trim().replace(/\s+/g, "");
  const dot = addr.indexOf(".");
  if (dot > 14 && (/^(bc1|tb1)/i.test(addr) || /^[13]/.test(addr))) {
    addr = addr.slice(0, dot);
  }

  try {
    const res = await fetch(
      `https://mempool.space/api/address/${encodeURIComponent(addr)}/txs`,
      { cache: "no-store", signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) {
      return NextResponse.json({ blocks: [], error: `HTTP ${res.status}` }, { status: 200 });
    }
    const txs = (await res.json()) as Array<{
      txid: string;
      status: { confirmed: boolean; block_height?: number; block_time?: number };
      vin: Array<{ is_coinbase?: boolean; prevout?: unknown }>;
      vout: Array<{ value: number; scriptpubkey_address?: string }>;
    }>;

    const coinbases = (txs || [])
      .filter((tx) => tx.vin?.some((v) => v.is_coinbase))
      .map((tx) => {
        const payout = (tx.vout || [])
          .filter((o) => o.scriptpubkey_address === addr)
          .reduce((s, o) => s + (o.value || 0), 0);
        return {
          txid: tx.txid,
          height: tx.status?.block_height ?? null,
          time: tx.status?.block_time ?? null,
          confirmed: !!tx.status?.confirmed,
          valueSats: payout,
        };
      })
      .filter((b) => b.valueSats > 0);

    return NextResponse.json({ blocks: coinbases, fetchedAt: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { blocks: [], error: e instanceof Error ? e.message : "failed" },
      { status: 200 }
    );
  }
}
