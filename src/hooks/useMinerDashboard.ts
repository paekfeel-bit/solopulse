"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CkUserStats, HashrateSample, NetworkStats } from "@/lib/types";
import { toGHs } from "@/lib/mining";
import { selectStableHashrate } from "@/lib/hashrate";
import { loadHistory, pushSample, getStoredPool } from "@/lib/history";
import { fetchAddressBlocks, fetchMiner, fetchNetwork } from "@/lib/fetchData";
import {
  notify,
  notifyBlockFound,
  shouldNotifyBestShare,
  wasBlockCelebrated,
  markBlockCelebrated,
} from "@/lib/notify";
import { computeSourceContact } from "@/lib/sourceContact";

/** CKPool / miner stats — live path */
const MINER_POLL_MS = 2_000;
/** Network difficulty / price — changes slowly */
const NETWORK_POLL_MS = 12_000;
/** Coinbase / block payout check */
const ADDRESS_POLL_MS = 25_000;

export interface DashboardState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  pool: string;
  user: CkUserStats | null;
  network: NetworkStats | null;
  history: HashrateSample[];
  celebration: null | { txid: string; height: number | null; valueSats: number };
  lastUpdated: number | null;
  refresh: () => Promise<void>;
}

async function loadMiner(address: string, poolPref: string, bust: string) {
  try {
    const res = await fetch(
      `/api/miner/${encodeURIComponent(address)}?pool=${encodeURIComponent(poolPref)}&${bust}`,
      { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
    );
    if (res.ok) {
      const j = await res.json();
      if (j.user) return j;
      if (j.error) throw new Error(j.error);
    }
  } catch {
    /* fallback */
  }
  return fetchMiner(address, poolPref);
}

async function loadNetwork(bust: string) {
  try {
    const res = await fetch(`/api/network?${bust}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const j = await res.json();
      if (!j.error) return j;
    }
  } catch {
    /* */
  }
  return fetchNetwork();
}

async function loadAddr(address: string, bust: string) {
  try {
    const res = await fetch(`/api/address/${encodeURIComponent(address)}?${bust}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) return res.json();
  } catch {
    /* */
  }
  return fetchAddressBlocks(address);
}

function normalizeUser(u: CkUserStats): CkUserStats {
  u.hashrate1m = u.hashrate1m ?? "0";
  u.hashrate5m = u.hashrate5m ?? u.hashrate1m;
  u.hashrate1hr = u.hashrate1hr ?? "0";
  u.hashrate1d = u.hashrate1d ?? "0";
  u.hashrate7d = u.hashrate7d ?? "0";
  u.workers = Number(u.workers) || 0;
  u.shares = Number(u.shares) || 0;
  u.bestshare = Number(u.bestshare) || 0;
  u.bestever = Number(u.bestever) || u.bestshare || 0;
  u.lastshare = Number(u.lastshare) || 0;
  u.authorised = Number(u.authorised) || u.lastshare || 0;
  u.worker = Array.isArray(u.worker) ? u.worker : [];
  return u;
}

export function useMinerDashboard(address: string | null): DashboardState {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState("solo.ckpool.org");
  const [user, setUser] = useState<CkUserStats | null>(null);
  const [network, setNetwork] = useState<NetworkStats | null>(null);
  const [history, setHistory] = useState<HashrateSample[]>([]);
  const [celebration, setCelebration] = useState<DashboardState["celebration"]>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const prevBest = useRef(0);
  const minerInFlight = useRef(false);
  const netInFlight = useRef(false);
  const addrInFlight = useRef(false);
  const sourceNotified = useRef(false);
  const userRef = useRef<CkUserStats | null>(null);
  const networkRef = useRef<NetworkStats | null>(null);
  const poolRef = useRef("solo.ckpool.org");

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    networkRef.current = network;
  }, [network]);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  const processMiner = useCallback(
    (minerJson: { user?: CkUserStats; pool?: string; error?: string }, poolPref: string) => {
      const u = minerJson.user as CkUserStats;
      if (
        !u ||
        (u.hashrate1m == null &&
          u.hashrate5m == null &&
          u.workers == null &&
          u.shares == null &&
          !u.worker?.length &&
          u.lastshare == null)
      ) {
        throw new Error(minerJson.error || "Empty miner response");
      }
      normalizeUser(u);
      setUser(u);
      setPool(minerJson.pool || poolPref);
      setError(null);
      setLastUpdated(Date.now());

      const selected = selectStableHashrate(u);
      // Chart from pool path uses live 1m display when device not driving chart
      setHistory((prev) =>
        pushSample(
          address!,
          toGHs(selected.displayHs || selected.instantHs || selected.stableHs),
          prev.length ? prev : loadHistory(address!)
        )
      );

      const best = Number(u.bestshare || u.bestever || 0);
      const nd = Number(networkRef.current?.difficulty || 0);
      if (nd > 0 && shouldNotifyBestShare(best, nd)) {
        const pct = ((best / nd) * 100).toFixed(4);
        notify(
          "SoloPulse — strong share!",
          `Best share ${best.toExponential(2)} ≈ ${pct}% of network difficulty`,
          "bestshare"
        );
      }
      if (nd > 0 && best >= nd && best > prevBest.current) {
        const id = `best-${Math.floor(best)}`;
        if (!wasBlockCelebrated(id)) {
          markBlockCelebrated(id);
          setCelebration({
            txid: id,
            height: networkRef.current?.blockHeight ?? null,
            valueSats: 0,
          });
          notifyBlockFound(networkRef.current?.blockHeight ?? null, 0);
        }
      }
      prevBest.current = best;

      const contact = computeSourceContact({
        hashrateHs: selected.displayHs || selected.stableHs,
        bestShare: best,
        networkDiff: nd,
        lastShareUnix: Number(u.lastshare || 0),
        authorisedUnix: Number(u.authorised || 0),
        shares: Number(u.shares || 0),
        workers: Number(u.workers || 0),
        pool: minerJson.pool || poolPref,
      });
      if (contact.overall >= 90) {
        if (!sourceNotified.current) {
          sourceNotified.current = true;
          notify(
            "SoloPulse — 성공 소스 90%+",
            `Source contact ${contact.overall.toFixed(0)}% — mechanism fully engaged`,
            "source-90"
          );
        }
      } else if (contact.overall < 80) {
        sourceNotified.current = false;
      }
    },
    [address]
  );

  const fetchMinerOnly = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!address) return;
      if (minerInFlight.current && !opts?.manual) return;
      minerInFlight.current = true;
      if (opts?.manual) setRefreshing(true);
      try {
        const poolPref = getStoredPool();
        const minerJson = await loadMiner(address, poolPref, `_=${Date.now()}`);
        processMiner(minerJson, poolPref);
      } catch (e) {
        // Keep last good user if we have one
        if (!userRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load miner");
        } else {
          setError(e instanceof Error ? e.message : "Miner refresh failed");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        minerInFlight.current = false;
      }
    },
    [address, processMiner]
  );

  const fetchNetworkOnly = useCallback(async () => {
    if (netInFlight.current) return;
    netInFlight.current = true;
    try {
      const netJson = (await loadNetwork(`_=${Date.now()}`)) as NetworkStats;
      if (netJson && Number(netJson.difficulty) > 0) {
        setNetwork(netJson);
      }
    } catch {
      /* keep last */
    } finally {
      netInFlight.current = false;
    }
  }, []);

  const fetchAddressOnly = useCallback(async () => {
    if (!address || addrInFlight.current) return;
    addrInFlight.current = true;
    try {
      const addrJson = await loadAddr(address, `_=${Date.now()}`);
      const blocks = addrJson.blocks || [];
      if (blocks.length > 0) {
        const latest = blocks[0];
        if (latest?.txid && !wasBlockCelebrated(latest.txid)) {
          markBlockCelebrated(latest.txid);
          setCelebration({
            txid: latest.txid,
            height: latest.height,
            valueSats: latest.valueSats,
          });
          notifyBlockFound(latest.height, latest.valueSats);
        }
      }
    } catch {
      /* */
    } finally {
      addrInFlight.current = false;
    }
  }, [address]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchMinerOnly({ manual: true }), fetchNetworkOnly(), fetchAddressOnly()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchMinerOnly, fetchNetworkOnly, fetchAddressOnly]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    sourceNotified.current = false;
    setHistory(loadHistory(address));
    // Initial burst
    void fetchMinerOnly();
    void fetchNetworkOnly();
    void fetchAddressOnly();

    const minerId = setInterval(() => void fetchMinerOnly(), MINER_POLL_MS);
    const netId = setInterval(() => void fetchNetworkOnly(), NETWORK_POLL_MS);
    const addrId = setInterval(() => void fetchAddressOnly(), ADDRESS_POLL_MS);
    return () => {
      clearInterval(minerId);
      clearInterval(netId);
      clearInterval(addrId);
    };
  }, [address, fetchMinerOnly, fetchNetworkOnly, fetchAddressOnly]);

  return {
    loading,
    refreshing,
    error,
    pool,
    user,
    network,
    history,
    celebration,
    lastUpdated,
    refresh,
  };
}
