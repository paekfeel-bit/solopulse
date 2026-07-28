"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toClientId, clientIdShort } from "@/lib/clientId";

/**
 * Public page for third-party users:
 * - Website alone = full pool dashboard (no install)
 * - Optional Device Link = one download from THIS page (home PC)
 * Browser cannot become the LAN bridge (security) — download is the productized path.
 */
function BridgePageInner() {
  const sp = useSearchParams();
  const [address, setAddress] = useState("");
  const [subnet, setSubnet] = useState("172.30.1");
  const [minerIp, setMinerIp] = useState("");
  const clientId = useMemo(() => toClientId(address || "default"), [address]);

  useEffect(() => {
    const a = sp.get("address") || sp.get("clientId") || "";
    if (a) setAddress(a);
  }, [sp]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ clientId });
    if (subnet) p.set("subnet", subnet);
    if (minerIp.trim()) p.set("minerIp", minerIp.trim());
    return p.toString();
  }, [clientId, subnet, minerIp]);

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-amber-500 hover:underline">
            ← SoloPulse
          </Link>
          <span className="text-[10px] uppercase tracking-widest text-stone-500">
            Device Link
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            링크만으로 충분할까요?
          </h1>
          <p className="text-sm text-stone-400 leading-relaxed">
            <strong className="text-stone-200">예 — 풀(pool) 모니터링</strong>은
            웹만 열면 됩니다. BTC 주소 입력 → 해시·확률·차트.
          </p>
          <p className="text-sm text-stone-400 leading-relaxed">
            <strong className="text-stone-200">집 마이너 실시간</strong>
            (온도·보드 해시)만 선택 설치가 필요합니다. 인터넷 사이트가 집 안
            IP로 직접 들어갈 수 없기 때문입니다.
          </p>
        </header>

        <section className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-emerald-300">
            ① 웹만 (제3자 기본)
          </h2>
          <ol className="text-xs text-stone-400 list-decimal pl-4 space-y-1">
            <li>SoloPulse 링크 열기</li>
            <li>채굴 주소 입력</li>
            <li>풀 기준 대시보드 사용 — 설치 없음</li>
          </ol>
          <Link
            href="/"
            className="inline-flex mt-2 rounded-xl bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-stone-950"
          >
            웹 대시보드 열기
          </Link>
        </section>

        <section className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-300">
            ② 기기 실시간 (선택 · 자기 집 PC)
          </h2>
          <p className="text-[11px] text-stone-400">
            사이트에서 주소가 들어간 설정 파일을 받아,{" "}
            <strong className="text-stone-200">마이너와 같은 Wi‑Fi의 PC</strong>
            에서 실행하세요. 다른 사용자와 데이터가 섞이지 않도록{" "}
            <code className="text-amber-200/90">CLIENT_ID</code> = 당신 주소입니다.
          </p>

          <label className="block text-[11px] text-stone-500">
            채굴 주소 (CLIENT_ID)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="bc1q... 또는 1..."
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono text-stone-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-stone-500">
              서브넷 (예: 172.30.1)
              <input
                value={subnet}
                onChange={(e) => setSubnet(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-[11px] text-stone-500">
              마이너 IP (선택)
              <input
                value={minerIp}
                onChange={(e) => setMinerIp(e.target.value)}
                placeholder="비우면 자동 검색"
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>
          <p className="text-[10px] font-mono text-stone-500">
            clientId = {clientIdShort(clientId, 14)}
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={`/api/bridge/bundle?${qs}&format=bat`}
              className="flex-1 text-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-950"
            >
              Windows .bat 다운로드
            </a>
            <a
              href={`/api/bridge/bundle?${qs}&format=ps1`}
              className="flex-1 text-center rounded-xl border border-stone-600 px-4 py-3 text-sm text-stone-200"
            >
              PowerShell .ps1
            </a>
          </div>
          <ol className="text-[11px] text-stone-400 list-decimal pl-4 space-y-1 pt-1">
            <li>파일 저장 → 집 PC에서 더블클릭</li>
            <li>Node.js + Git 필요 (최초 1회 안내)</li>
            <li>창 유지한 채 폰/PC에서 SoloPulse 웹 접속</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-stone-800 bg-stone-900/50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-stone-200">
            왜 브리지를 사이트 코드 안에 못 넣나요?
          </h2>
          <ul className="text-[11px] text-stone-400 space-y-1.5 list-disc pl-4">
            <li>
              웹은 클라우드(HTTPS)에 있고, 마이너는 집 안 사설 IP에 있습니다.
              서버가 <code className="text-stone-300">172.x</code> 로 접속할 수
              없습니다.
            </li>
            <li>
              브라우저 보안: HTTPS 페이지 → HTTP 기기 = Mixed Content 차단, CORS
              차단.
            </li>
            <li>
              그래서 “완전체”는{" "}
              <strong className="text-stone-200">웹 UI(사이트) + 선택 Device Link</strong>
              를 <strong className="text-stone-200">같은 제품</strong>으로 묶는
              방식입니다. 다운로드가 사이트에서 나오고, 주소로 자동 설정됩니다.
            </li>
          </ul>
        </section>

        <p className="text-[10px] text-center text-stone-600 pb-8">
          이미 solopulse 폴더가 있는 경우: 폴더의{" "}
          <code>start-bridge.bat</code> +{" "}
          <code>set CLIENT_ID=당신주소</code>
        </p>
      </div>
    </div>
  );
}

export default function BridgePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-stone-950 text-stone-400 flex items-center justify-center text-sm">
          Loading…
        </div>
      }
    >
      <BridgePageInner />
    </Suspense>
  );
}
