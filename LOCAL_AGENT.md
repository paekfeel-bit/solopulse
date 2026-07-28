# SoloPulse Local Agent

Production 아키텍처 (마스터 프롬프트 §9–12):

```
Miner (AxeOS LAN)
   ↓  집 PC 같은 Wi‑Fi
Local Agent  (start-local-agent.bat)
   ↓  HTTPS POST + agent key
Cloud  /api/agent/telemetry
   ↓
Dashboard (Agent live gauges + Source Engine)
```

**클라우드가 172.x / 192.168.x 를 직접 열지 않습니다.**

## 실행

```bat
set SOLOPULSE_CLOUD_URL=https://solopulse-black.vercel.app
set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
start-local-agent.bat
```

또는 `start-local-agent.bat` 안의 기본 URL을 수정.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `SOLOPULSE_CLOUD_URL` | 웹앱 URL (Vercel/Railway) |
| `SOLOPULSE_AGENT_KEY` | 서버 `SOLOPULSE_AGENT_KEY` 와 동일 |
| `MINER_IP` | 선택. 비우면 LAN 자동 검색 |
| `MINER_SUBNET` | 기본 `172.30.1` |

## 서버 환경 (Railway/Vercel)

```
SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
```

## API

- `POST /api/agent/telemetry` — 실측 텔레메트리
- `POST /api/agent/heartbeat` — Agent 상태
- `GET  /api/agent/telemetry` — 대시보드 폴링
