"use client";

import type { CSSProperties } from "react";

/**
 * Orange laser that runs only along the layout card border line
 * (mask-cut so interior is empty — no full-screen wash).
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
      {/* Rotating conic light, masked to 2px border only */}
      <div className="absolute -inset-[1px] rounded-[inherit] sp-border-laser-spin" style={style}>
        <div
          className="absolute inset-0 rounded-[inherit] sp-border-laser-cone"
          style={{
            background: `conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 318deg,
              rgba(194, 65, 12, 0) 330deg,
              rgba(234, 88, 12, 0.55) 342deg,
              rgba(249, 115, 22, 1) 350deg,
              rgba(251, 146, 60, 1) 354deg,
              rgba(249, 115, 22, 0.9) 357deg,
              transparent 360deg
            )`,
          }}
        />
      </div>
      {/* Edge flash only */}
      <div className="absolute inset-0 rounded-[inherit] sp-border-laser-flash" style={style} />
    </div>
  );
}

/** Full-page laser removed — card border only. */
export function PulseLaserFrame() {
  return null;
}
