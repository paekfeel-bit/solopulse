# SoloPulse 수정 · 업그레이드 가이드

이 폴더가 **소스 오브 트루스**입니다. 여기서 수정한 뒤 Netlify에 다시 올리면 영구 사이트가 갱신됩니다.

## 1) 코드 수정 후 로컬 확인

```bat
npm install
npm run build
npm run start
```

브라우저: http://localhost:3000

보드 실측(집 LAN):

```bat
start-solopulse.bat
```

## 2) Netlify 영구 사이트 업데이트 (권장)

### GitHub 연동 시 (자동)

1. 코드 수정 후 커밋 · 푸시
2. Netlify가 자동 빌드 · 배포
3. 같은 고정 URL 유지: **https://solopulse.netlify.app/**

### CLI 한 번에

```bat
update-and-deploy.bat
```

또는:

```bat
npm run deploy:netlify
```

### 새 배포 패키지 zip만 다시 만들기

```bat
npm run pack:export
```

→ `export\solopulse-netlify-*.zip` + `export\solopulse-netlify-READY.zip`

## 3) 기능별 어디에 손대나

| 기능 | 주요 경로 |
|------|-----------|
| 대시보드 UI | `src/components/Dashboard.tsx` |
| 기기 해시/온도 | `src/hooks/useDeviceHashrate.ts`, `src/lib/deviceClient.ts` |
| 기기 API | `src/app/api/device/` |
| 풀/채굴 데이터 | `src/hooks/useMinerDashboard.ts`, `src/lib/fetchData.ts` |
| 솔로 확률 | `src/lib/soloProbability.ts`, `src/components/SourceEngineHub.tsx` |
| Netlify 설정 | `netlify.toml`, `package.json` |

## 4) 터미널을 꺼도 되는 범위

| 기능 | 터미널 OFF 후 |
|------|----------------|
| 풀 해시, 확률, 가격, 멤풀, 차트 | **Netlify만으로 정상** |
| 보드 실측 해시·온도·전력 | **채굴기 터널이 PC에서 살아 있어야 함** (`start-miner-tunnel.bat` 또는 예약 작업) |

## 5) 채굴기 IP가 바뀌면 (DHCP)

1. AxeOS 화면의 새 IP 확인
2. 대시보드 기기 칸에 입력 → 기기 연결 / 자동 검색
3. `start-miner-tunnel.bat` 안의 `MINER_IP=` 도 같이 수정
4. 터널 재시작 후 새 `trycloudflare.com` URL을 Netlify 기기 칸에 저장

## 6) 보안 (Netlify 검사 통과 포인트)

- `/api/device` 는 LAN / 허용 터널 호스트만 프록시 (SSRF 가드)
- 비밀 API 키 없음
- Next.js 15.5.x 패치 버전 유지 (`package.json`)
