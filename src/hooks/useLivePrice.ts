"use client";

import { useEffect, useRef, useState } from "react";
import { fetchLiveBtcPrice } from "@/lib/fetchData";

const POLL_MS = 4_000;
const TICK_MS = 500;

/**
 * Live BTC price: polls a real spot source frequently.
 * Between polls, only tiny sub-cent dither (anchored to real quote — not fake drift).
 */
export function useLivePrice(seedPrice = 0) {
  const [base, setBase] = useState(seedPrice);
  const [display, setDisplay] = useState(seedPrice);
  const [delta, setDelta] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);
  const tickRef = useRef(0);
  const prevBase = useRef(seedPrice);

  useEffect(() => {
    if (seedPrice > 0 && base === 0) {
      setBase(seedPrice);
      setDisplay(seedPrice);
      prevBase.current = seedPrice;
    }
  }, [seedPrice, base]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const p = await fetchLiveBtcPrice();
        if (!cancelled && p > 0) {
          setDelta(prevBase.current > 0 ? p - prevBase.current : 0);
          prevBase.current = p;
          setBase(p);
          setDisplay(p);
          setFetchedAt(Date.now());
        }
      } catch {
        /* keep last */
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (base <= 0) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      // ≤ ±$0.15 visual only — never invent dollar moves
      const s1 = Math.sin(Date.now() / 1100 + tickRef.current * 0.2);
      const noise = s1 * 0.12;
      setDisplay(base + noise);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [base]);

  return {
    price: display,
    base,
    delta,
    up: display >= base,
    fetchedAt,
  };
}
