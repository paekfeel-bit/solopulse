"use client";

import { useEffect, useRef, useState } from "react";
import {
  createLiveEngine,
  TICK_MS,
  type LiveTickState,
} from "@/lib/liveEngine";

export function useLiveOdds(params: {
  hashrateBase: number;
  difficulty: number;
  bestShare: number;
  active: boolean;
}) {
  const engineRef = useRef(createLiveEngine());
  const [tick, setTick] = useState<LiveTickState | null>(null);

  // Reset session counters when base hashrate identity changes a lot (new address)
  const prevBase = useRef(params.hashrateBase);
  useEffect(() => {
    if (
      prevBase.current > 0 &&
      params.hashrateBase > 0 &&
      Math.abs(Math.log(params.hashrateBase) - Math.log(prevBase.current)) > Math.log(2)
    ) {
      engineRef.current.reset();
    }
    prevBase.current = params.hashrateBase;
  }, [params.hashrateBase]);

  useEffect(() => {
    if (!params.active || params.difficulty <= 0) return;

    const run = () => {
      const state = engineRef.current.tick({
        hashrateBase: params.hashrateBase,
        difficulty: params.difficulty,
        bestShare: params.bestShare,
      });
      setTick(state);
    };

    run();
    const id = setInterval(run, TICK_MS);
    return () => clearInterval(id);
  }, [params.active, params.hashrateBase, params.difficulty, params.bestShare]);

  return tick;
}
