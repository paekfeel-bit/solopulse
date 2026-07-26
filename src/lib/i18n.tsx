"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "ko" | "en" | "ja";

const dict = {
  ko: {
    appName: "SoloPulse",
    tagline: "소형 솔로 마이닝 실시간 레이더",
    addressLabel: "채굴 입금 주소",
    poolLabel: "풀 선택",
    openDashboard: "대시보드 열기",
    invalidAddress: "유효한 비트코인 주소(bc1… / 1… / 3…)를 입력하세요",
    scanning: "마이너를 찾는 중…",
    retry: "다시 시도",
    changeAddress: "주소 변경",
    exit: "나가기",
    refresh: "새로고침",
    notifyOn: "알림 켜짐 (블록·셰어·소스·과열)",
    notifyOff: "알림 꺼짐",
    online: "온라인",
    offline: "오프라인",
    connecting: "연결 확인 중",
    liveHashrate: "실시간 해시레이트",
    poolReported: "풀 보고",
    deviceAccurate: "기기 기준 (안정)",
    workers: "워커 수",
    authorised: "인증",
    lastShare: "마지막 셰어",
    totalShares: "총 셰어",
    bestShare: "최고 셰어",
    bestEver: "역대 최고",
    oddsTitle: "블록 발견 확률",
    oddsHint: "지금 이 해시레이트로 비트코인을 받을 확률",
    oneDay: "1일",
    oneWeek: "1주",
    oneMonth: "1개월",
    oneYear: "1년",
    expectedTime: "기대 소요 시간",
    btcPrice: "비트코인 가격",
    difficulty: "난이도",
    blockReward: "블록 보상",
    network: "네트워크",
    height: "높이",
    shareVsTarget: "셰어 vs 네트워크 타겟",
    feedback: "피드백 @medbedeee",
    light: "라이트",
    dark: "다크",
    installHint: "홈 화면에 SoloPulse 추가",
    installBtn: "설치",
    later: "나중에",
    iosInstall: "Safari 공유 → 홈 화면에 추가",
    chanceExplain:
      "한 번의 해시가 블록이 될 확률 ≈ 1/(난이도×2³²). 아래 숫자는 그 수학으로 실시간 재계산됩니다.",
    yourChance: "내 비트코인 획득 확률",
    justNow: "방금",
    mechanism: "메커니즘",
    cases: "성공 사례",
    history: "해시레이트 기록",
    footer: "데이터: 기기 1s · 풀 2s · mempool · 0.5초 확률 틱",
    errorMiner: "마이너를 찾지 못했습니다. 주소·풀·온라인 상태를 확인하세요.",
    publicPool: "Public Pool",
    ckpool: "CKPool",
    mempoolBlocks: "밈풀 블록 현황",
    mempoolBlocksHint: "mempool.space 와 같은 최근 블록 · 누가 채굴했는지",
    miningNow: "현재 채굴 중",
    latestBlock: "최신 블록",
    minedBy: "채굴 풀",
    inProgress: "진행 중",
    blockInterval: "직전 간격",
    timeSinceLast: "마지막 블록 이후",
    reward: "보상",
    sourceContact: "성공 소스 접촉",
    sourceContactHint: "승자 조건 정렬도 (100% ≠ BTC 보상). 보상은 블록 발견 시에만.",
    sourceTouching: "조건 정렬",
    sourceNotTouching: "미정렬",
    nearestWinCase: "가장 가까운 성공 사례",
    sourceMath: "정렬 = 온라인+대역+솔로풀+셰어+사다리+가동 · BTC는 블록만",
    sourceTruth:
      "100% 접촉은 ‘승자와 같은 조건’일 뿐, 비트코인 확정이 아닙니다. 보상은 bestDiff≥네트워크 난이도 또는 입금 주소 코인베이스일 때만.",
    deviceIp: "채굴기 IP (로컬)",
    deviceLive: "기기 실시간",
    poolOnly: "풀 보고 (참고)",
  },
  en: {
    appName: "SoloPulse",
    tagline: "Real-time small solo mining radar",
    addressLabel: "Mining payout address",
    poolLabel: "Pool",
    openDashboard: "Open dashboard",
    invalidAddress: "Enter a valid Bitcoin address (bc1… / 1… / 3…)",
    scanning: "Scanning for your miner…",
    retry: "Retry",
    changeAddress: "Change address",
    exit: "Exit",
    refresh: "Refresh",
    notifyOn: "Alerts on (block · share · source · heat)",
    notifyOff: "Alerts off",
    online: "Online",
    offline: "Offline",
    connecting: "Checking link",
    liveHashrate: "Live hashrate",
    poolReported: "Pool reported",
    deviceAccurate: "Device-accurate (stable)",
    workers: "Workers",
    authorised: "Authorised",
    lastShare: "Last share",
    totalShares: "Total shares",
    bestShare: "Best share",
    bestEver: "Best ever",
    oddsTitle: "Odds of finding a block",
    oddsHint: "Your chance to earn bitcoin at this hashrate",
    oneDay: "1 Day",
    oneWeek: "1 Week",
    oneMonth: "1 Month",
    oneYear: "1 Year",
    expectedTime: "Expected time",
    btcPrice: "BTC price",
    difficulty: "Difficulty",
    blockReward: "Block reward",
    network: "Network",
    height: "Height",
    shareVsTarget: "Share vs network target",
    feedback: "Feedback @medbedeee",
    light: "Light",
    dark: "Dark",
    installHint: "Add SoloPulse to Home Screen",
    installBtn: "Install",
    later: "Later",
    iosInstall: "Safari Share → Add to Home Screen",
    chanceExplain:
      "P(hash is block) ≈ 1/(difficulty×2³²). Numbers below recompute live from that math.",
    yourChance: "Your chance to win bitcoin",
    justNow: "just now",
    mechanism: "Mechanism",
    cases: "Win cases",
    history: "Hashrate history",
    footer: "Data: device 1s · pool 2s · mempool · 0.5s odds tick",
    errorMiner: "Miner not found. Check address, pool, and online status.",
    publicPool: "Public Pool",
    ckpool: "CKPool",
    mempoolBlocks: "Mempool block status",
    mempoolBlocksHint: "Recent blocks like mempool.space · who mined them",
    miningNow: "Mining now",
    latestBlock: "Latest block",
    minedBy: "Mined by",
    inProgress: "in progress",
    blockInterval: "Last interval",
    timeSinceLast: "Since last block",
    reward: "Reward",
    sourceContact: "Success source contact",
    sourceContactHint: "Winner-condition alignment (100% ≠ BTC). Reward only on block find.",
    sourceTouching: "ALIGNED",
    sourceNotTouching: "NOT ALIGNED",
    nearestWinCase: "Nearest documented win",
    sourceMath: "Align = online+band+solo+shares+ladder+uptime · BTC only on block",
    sourceTruth:
      "100% contact means winner-like conditions only — not a BTC payout. Reward only if bestDiff ≥ network difficulty or coinbase to your address.",
    deviceIp: "Miner IP (LAN)",
    deviceLive: "Device live",
    poolOnly: "Pool report (ref)",
  },
  ja: {
    appName: "SoloPulse",
    tagline: "小型ソロマイニング リアルタイムレーダー",
    addressLabel: "採掘受取アドレス",
    poolLabel: "プール選択",
    openDashboard: "ダッシュボードを開く",
    invalidAddress: "有効なビットコインアドレス (bc1… / 1… / 3…) を入力",
    scanning: "マイナーを検索中…",
    retry: "再試行",
    changeAddress: "アドレス変更",
    exit: "終了",
    refresh: "更新",
    notifyOn: "通知オン（ブロック・シェア・ソース・過熱）",
    notifyOff: "通知オフ",
    online: "オンライン",
    offline: "オフライン",
    connecting: "接続確認中",
    liveHashrate: "ライブハッシュレート",
    poolReported: "プール報告",
    deviceAccurate: "デバイス基準（安定）",
    workers: "ワーカー数",
    authorised: "認証",
    lastShare: "最終シェア",
    totalShares: "総シェア",
    bestShare: "ベストシェア",
    bestEver: "歴代最高",
    oddsTitle: "ブロック発見確率",
    oddsHint: "このハッシュレートでBTCを得る確率",
    oneDay: "1日",
    oneWeek: "1週",
    oneMonth: "1ヶ月",
    oneYear: "1年",
    expectedTime: "期待時間",
    btcPrice: "BTC価格",
    difficulty: "難易度",
    blockReward: "ブロック報酬",
    network: "ネットワーク",
    height: "高さ",
    shareVsTarget: "シェア vs ネットワーク目標",
    feedback: "フィードバック @medbedeee",
    light: "ライト",
    dark: "ダーク",
    installHint: "ホーム画面に SoloPulse を追加",
    installBtn: "インストール",
    later: "後で",
    iosInstall: "Safari 共有 → ホーム画面に追加",
    chanceExplain:
      "1ハッシュがブロックになる確率 ≈ 1/(難易度×2³²)。下の数字はその数式でリアルタイム再計算。",
    yourChance: "BTC獲得確率",
    justNow: "たった今",
    mechanism: "メカニズム",
    cases: "成功事例",
    history: "ハッシュレート履歴",
    footer: "データ: 機器1s · プール2s · mempool · 0.5秒オッズ",
    errorMiner: "マイナーが見つかりません。アドレス・プール・稼働を確認してください。",
    publicPool: "Public Pool",
    ckpool: "CKPool",
    mempoolBlocks: "メムプール ブロック状況",
    mempoolBlocksHint: "mempool.space と同じ最近のブロック · 誰が採掘したか",
    miningNow: "現在採掘中",
    latestBlock: "最新ブロック",
    minedBy: "採掘プール",
    inProgress: "進行中",
    blockInterval: "前回間隔",
    timeSinceLast: "最終ブロックから",
    reward: "報酬",
    sourceContact: "成功ソース接触",
    sourceContactHint: "勝者条件の整合度（100% ≠ BTC）。報酬はブロック時のみ。",
    sourceTouching: "整合中",
    sourceNotTouching: "未整合",
    nearestWinCase: "最も近い成功事例",
    sourceMath: "整合 = オンライン+帯+ソロ+シェア+梯子+稼働 · BTCはブロック時のみ",
    sourceTruth:
      "接触100%は勝者と同じ条件という意味で、BTC確定ではありません。報酬は bestDiff≥ネットワーク難易度 またはコインベース時のみ。",
    deviceIp: "マイナーIP（LAN）",
    deviceLive: "デバイス実測",
    poolOnly: "プール報告（参考）",
  },
} as const;

export type DictKey = keyof (typeof dict)["ko"];

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  cycleLocale: () => void;
  t: (key: DictKey) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

const ORDER: Locale[] = ["ko", "en", "ja"];

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    const s = localStorage.getItem("solopulse:locale") as Locale | null;
    if (s === "ko" || s === "en" || s === "ja") setLocaleState(s);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("solopulse:locale", l);
  }, []);

  const cycleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const i = ORDER.indexOf(prev);
      const next = ORDER[(i + 1) % ORDER.length];
      localStorage.setItem("solopulse:locale", next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: DictKey) => dict[locale][key] ?? dict.en[key] ?? key,
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, cycleLocale, t }),
    [locale, setLocale, cycleLocale, t]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

/** Current language label on the toggle (not "next") */
export function localeButtonLabel(locale: Locale): string {
  if (locale === "ko") return "한";
  if (locale === "en") return "EN";
  return "日";
}

export function localeExitLabel(locale: Locale): string {
  if (locale === "ko") return "나가기";
  if (locale === "en") return "Exit";
  return "終了";
}
