/**
 * Hybrid hub — sites miners use daily.
 * Device URLs are LAN-only unless user tunnels them.
 */

export type HubLink = {
  id: string;
  title: string;
  titleKo: string;
  desc: string;
  descKo: string;
  /** Static base or builder */
  href: string | ((ctx: HubContext) => string);
  category: "device" | "pool" | "explorer" | "stats" | "tools";
  /** Open in iframe when same-origin / allows embed */
  embed?: boolean;
  /** LAN only — won't work on mobile LTE without tunnel */
  lanOnly?: boolean;
  icon: string;
};

export type HubContext = {
  address: string;
  deviceIp: string;
  pool: string;
};

export const HUB_LINKS: HubLink[] = [
  {
    id: "device-home",
    title: "My miner (AxeOS)",
    titleKo: "내 채굴기 홈 (AxeOS)",
    desc: "Device dashboard — LAN or via home server",
    descKo: "기기 대시보드 — 집 와이파이 또는 홈 서버 경유",
    href: (c) => (c.deviceIp ? `http://${c.deviceIp}/` : "#"),
    category: "device",
    lanOnly: true,
    icon: "⛏️",
  },
  {
    id: "device-api",
    title: "Device API info",
    titleKo: "기기 API 상태",
    desc: "Raw /api/system/info JSON",
    descKo: "원시 시스템 정보 JSON",
    href: (c) => (c.deviceIp ? `http://${c.deviceIp}/api/system/info` : "#"),
    category: "device",
    lanOnly: true,
    icon: "🔌",
  },
  {
    id: "ckpool-user",
    title: "CKPool user stats",
    titleKo: "CKPool 유저 통계",
    desc: "Graphical + raw pool stats for your address",
    descKo: "주소별 풀 그래프·원본 통계",
    href: (c) =>
      c.address
        ? `https://stats.ckpool.org/users/${encodeURIComponent(c.address)}`
        : "https://stats.ckpool.org/",
    category: "pool",
    icon: "📊",
  },
  {
    id: "ckpool-solo",
    title: "Solo CKPool",
    titleKo: "Solo CKPool",
    desc: "Main solo.ckpool.org",
    descKo: "솔로 풀 메인",
    href: "https://solo.ckpool.org/",
    category: "pool",
    icon: "🌊",
  },
  {
    id: "ckpool-raw",
    title: "CKPool raw user JSON",
    titleKo: "CKPool raw JSON",
    desc: "Direct pool API text",
    descKo: "풀 원본 유저 데이터",
    href: (c) =>
      c.address
        ? `https://solo.ckpool.org/users/${encodeURIComponent(c.address)}`
        : "https://solo.ckpool.org/",
    category: "pool",
    icon: "{ }",
  },
  {
    id: "public-pool",
    title: "Public Pool",
    titleKo: "Public Pool",
    desc: "web.public-pool.io",
    descKo: "퍼블릭 솔로 풀",
    href: "https://web.public-pool.io/",
    category: "pool",
    icon: "🌐",
  },
  {
    id: "mempool",
    title: "mempool.space",
    titleKo: "mempool.space",
    desc: "Blocks, fees, explorer",
    descKo: "블록·수수료·탐색기",
    href: "https://mempool.space/",
    category: "explorer",
    icon: "🧱",
  },
  {
    id: "mempool-addr",
    title: "My address on mempool",
    titleKo: "내 주소 (mempool)",
    desc: "On-chain txs / coinbase check",
    descKo: "온체인·코인베이스 확인",
    href: (c) =>
      c.address
        ? `https://mempool.space/address/${encodeURIComponent(c.address)}`
        : "https://mempool.space/",
    category: "explorer",
    icon: "📬",
  },
  {
    id: "solochance",
    title: "SoloChance blocks",
    titleKo: "SoloChance 블록",
    desc: "Verified solo block list",
    descKo: "검증된 솔로 블록 목록",
    href: "https://solochance.com/solo-blocks.php",
    category: "stats",
    icon: "🎯",
  },
  {
    id: "bitaxe-wins",
    title: "Bitaxe block wins",
    titleKo: "Bitaxe 블록 승",
    desc: "D-Central tracker",
    descKo: "오픈소스 마이너 승 트래커",
    href: "https://d-central.tech/bitaxe-block-wins/",
    category: "stats",
    icon: "🏆",
  },
  {
    id: "miningpoolstats",
    title: "Mining Pool Stats",
    titleKo: "Mining Pool Stats",
    desc: "Pool hashrate distribution",
    descKo: "풀 해시레이트 분포",
    href: "https://miningpoolstats.stream/bitcoin",
    category: "stats",
    icon: "📈",
  },
  {
    id: "clark-moody",
    title: "Clark Moody Dashboard",
    titleKo: "Clark Moody",
    desc: "Bitcoin network dashboard",
    descKo: "비트코인 네트워크 대시보드",
    href: "https://bitcoin.clarkmoody.com/dashboard/",
    category: "tools",
    icon: "🧭",
  },
];

export function resolveHref(link: HubLink, ctx: HubContext): string {
  if (typeof link.href === "function") return link.href(ctx);
  return link.href;
}
