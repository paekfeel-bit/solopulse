import { NextResponse } from "next/server";
import { APP_VERSION, APP_VERSION_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Live version from deployed build — used so UI cannot stick on stale client bundle. */
export async function GET() {
  return NextResponse.json(
    {
      version: APP_VERSION,
      label: APP_VERSION_LABEL,
      t: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
