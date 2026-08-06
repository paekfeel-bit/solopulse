"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pool reports 1m/5m averages — they do not tick every second.
 * This hook keeps a 1 Hz live needle that:
 *  1) smoothly follows the latest pool base (real data)
 *  2) adds tiny multi-frequency pulse so gauges/readouts visibly move each second
 * Pulse is ±~1.2% of base — UI liveness, not inventing multi-TH swings.
 */
export function useLiveHashrate(baseHs: number, enabled: boolean) {
  const [liveHs, setLiveHs] = useState(0);
  const [tick, setTick] = useState(0);
  const targetRef = useRef(0);
  const smoothRef = useRef(0);
  const phaseRef = useRef(Math.random() * Math.PI * 2);

  useEffect(() => {
    if (baseHs > 0 && Number.isFinite(baseHs)) {
      targetRef.current = baseHs;
      if (smoothRef.current <= 0) smoothRef.current = baseHs;
    }
  }, [baseHs]);

  useEffect(() => {
    if (!enabled) {
      setLiveHs(0);
      return;
    }
    const id = window.setInterval(() => {
      const target = targetRef.current;
      if (!(target > 0)) {
        setLiveHs(0);
        setTick((n) => n + 1);
        return;
      }
      // Exponential smooth toward latest pool sample
      const prev = smoothRef.current > 0 ? smoothRef.current : target;
      const smoothed = prev * 0.72 + target * 0.28;
      smoothRef.current = smoothed;
      phaseRef.current += 0.85;
      const p = phaseRef.current;
      // Tiny pulse only (±~0.35%) so number stays near board (e.g. 4862 GH/s)
      // but still visibly ticks every second
      const pulse =
        Math.sin(p) * 0.002 +
        Math.sin(p * 1.7 + 0.4) * 0.001 +
        Math.sin(p * 0.55 + 1.1) * 0.0005;
      const next = Math.max(0, smoothed * (1 + pulse));
      setLiveHs(next);
      setTick((n) => n + 1);
    }, 1000);
    // Immediate first paint
    if (targetRef.current > 0) {
      smoothRef.current = targetRef.current;
      setLiveHs(targetRef.current);
    }
    return () => window.clearInterval(id);
  }, [enabled]);

  return {
    /** Animated live hashrate (H/s) for gauges / big number */
    liveHs,
    /** Last pool base (H/s) without pulse */
    baseHs: targetRef.current || baseHs,
    /** Increments every second */
    tick,
  };
}
