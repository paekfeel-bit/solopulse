"use client";

import type { CSSProperties } from "react";

/**
 * SoloPulse brand effect: yellow laser that races once around a panel
 * border, with a brief flash — then pauses and repeats.
 */
export function PulseLaser({
  className = "",
  intervalSec = 7,
}: {
  className?: string;
  intervalSec?: number;
}) {
  const dur = Math.max(4, intervalSec);
  const style = {
    ["--sp-pulse-period" as string]: `${dur}s`,
  } as CSSProperties;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-[inherit] ${className}`}
      aria-hidden
    >
      <div
        className="absolute -inset-[1px] rounded-[inherit] sp-pulse-laser"
        style={{
          ...style,
          background: `conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 328deg,
            rgba(250, 204, 21, 0.08) 338deg,
            rgba(253, 224, 71, 0.95) 350deg,
            #fef08a 355deg,
            rgba(253, 224, 71, 0.9) 358deg,
            transparent 360deg
          )`,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "2px",
        }}
      />
      <div className="absolute inset-0 rounded-[inherit] sp-pulse-flash" style={style} />
    </div>
  );
}

/** Full-page border pulse (dashboard shell) */
export function PulseLaserFrame() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0 sp-pulse-frame"
        style={{
          background: `conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 318deg,
            rgba(250, 204, 21, 0.05) 332deg,
            rgba(253, 224, 71, 0.75) 348deg,
            #fde047 354deg,
            rgba(253, 224, 71, 0.75) 358deg,
            transparent 360deg
          )`,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "2px",
        }}
      />
      <div className="absolute inset-0 sp-pulse-frame-flash" />
    </div>
  );
}
