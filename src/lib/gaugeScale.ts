/**
 * Round up to a clean instrument-scale ceiling (1 / 1.2 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 / 10 × 10^n).
 */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const f = x / base;
  let nf: number;
  if (f <= 1) nf = 1;
  else if (f <= 1.2) nf = 1.2;
  else if (f <= 1.5) nf = 1.5;
  else if (f <= 2) nf = 2;
  else if (f <= 2.5) nf = 2.5;
  else if (f <= 3) nf = 3;
  else if (f <= 4) nf = 4;
  else if (f <= 5) nf = 5;
  else if (f <= 6) nf = 6;
  else if (f <= 8) nf = 8;
  else nf = 10;
  return nf * base;
}

/**
 * Pick hashrate display unit + full-scale max from live GH/s (device-aware).
 * 1.2 TH → ~0–1.5 TH · 4.8 TH → ~0–6 TH · 10 TH → ~0–12 TH · sub-TH → GH/s.
 */
export function hashrateGaugeScale(
  liveGhs: number,
  peakGhs: number
): { value: number; max: number; unit: "GH/s" | "TH/s"; decimals: number } {
  const peak = Math.max(liveGhs, peakGhs, 0);
  // Prefer TH once device is ~0.8 TH or above (keeps labels short)
  const useTh = peak >= 800;
  if (useTh) {
    const liveTh = liveGhs / 1000;
    const peakTh = peak / 1000;
    const max = niceCeil(Math.max(peakTh * 1.25, liveTh * 1.15, 1.2));
    return {
      value: liveTh,
      max,
      unit: "TH/s",
      decimals: max < 3 ? 2 : max < 10 ? 1 : 1,
    };
  }
  const max = niceCeil(Math.max(peak * 1.25, liveGhs * 1.15, 100));
  return {
    value: liveGhs,
    max,
    unit: "GH/s",
    decimals: max < 100 ? 1 : 0,
  };
}

/**
 * Power scale from live watts + peak (device-aware).
 * ~40 W board → 0–50 · ~80 W → 0–100 · higher ASICs auto-expand.
 */
export function powerGaugeScale(
  liveW: number,
  peakW: number
): { value: number; max: number; decimals: number } {
  const peak = Math.max(liveW, peakW, 0);
  const max = niceCeil(Math.max(peak * 1.35, liveW * 1.2, 40));
  return {
    value: liveW,
    max,
    decimals: max < 100 ? 1 : 0,
  };
}

/** Compact tick text so labels don't collide on small dials. */
export function formatGaugeTick(val: number, unit?: string): string {
  if (!Number.isFinite(val)) return "—";
  const a = Math.abs(val);
  if (unit === "TH/s" || unit === "TH") {
    if (a >= 10) return String(Math.round(val));
    if (a >= 1) return val.toFixed(1).replace(/\.0$/, "");
    return val.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (a >= 10000) return `${(val / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${(val / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (a >= 100) return String(Math.round(val));
  if (a >= 10) return val % 1 === 0 ? String(Math.round(val)) : val.toFixed(0);
  if (a >= 1) return val % 1 === 0 ? String(Math.round(val)) : val.toFixed(1);
  return val.toFixed(1);
}
