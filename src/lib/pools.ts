export type PoolKind = "ckpool" | "publicpool";

export type PoolOption = {
  id: string;
  label: string;
  kind: PoolKind;
  /** Host used for API routing */
  host: string;
};

export const POOL_OPTIONS: PoolOption[] = [
  { id: "solo.ckpool.org", label: "CKPool Solo (US)", kind: "ckpool", host: "solo.ckpool.org" },
  { id: "eusolo.ckpool.org", label: "CKPool EU Solo", kind: "ckpool", host: "eusolo.ckpool.org" },
  { id: "ausolo.ckpool.org", label: "CKPool AU Solo", kind: "ckpool", host: "ausolo.ckpool.org" },
  { id: "sgsolo.ckpool.org", label: "CKPool SG Solo", kind: "ckpool", host: "sgsolo.ckpool.org" },
  {
    id: "public-pool.io",
    label: "Public Pool (public-pool.io)",
    kind: "publicpool",
    host: "public-pool.io",
  },
];

export function getPoolOption(id: string): PoolOption {
  return POOL_OPTIONS.find((p) => p.id === id) || POOL_OPTIONS[0];
}

export function isPublicPool(id: string): boolean {
  return getPoolOption(id).kind === "publicpool";
}
