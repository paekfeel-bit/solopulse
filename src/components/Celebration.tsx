"use client";

import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  height: number | null;
  valueSats: number;
  onClose: () => void;
}

export function Celebration({ open, height, valueSats, onClose }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) setShow(true);
  }, [open]);

  if (!show) return null;

  const btc = valueSats > 0 ? (valueSats / 1e8).toFixed(8) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShow(false); onClose(); }} />
      <div className="relative w-full max-w-sm rounded-3xl border border-amber-500/40 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8 text-center shadow-2xl shadow-amber-500/20 animate-in">
        <div className="text-6xl mb-4 animate-bounce">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">Block Found!</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Your solo miner hit the network target.
          {height != null && (
            <>
              <br />
              Height <span className="font-mono text-amber-400">#{height}</span>
            </>
          )}
          {btc && (
            <>
              <br />
              Payout ≈ <span className="font-mono text-emerald-400">{btc} BTC</span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setShow(false);
            onClose();
          }}
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-zinc-950 font-semibold py-3 text-sm"
        >
          Awesome
        </button>
      </div>
    </div>
  );
}
