@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse — 채굴기 영구 터널 (Netlify 보드 실측용)

REM 채굴기 AxeOS IP (DHCP로 바뀌면 여기만 수정)
set MINER_IP=172.30.1.8

echo.
echo  ========================================
echo   채굴기 → Cloudflare 공개 터널
echo  ========================================
echo   대상: http://%MINER_IP%
echo.
echo   이 창에 나오는 https://xxxx.trycloudflare.com 주소를
echo   Netlify SoloPulse 대시보드 「기기」칸에 넣고 [기기 연결] 하세요.
echo.
echo   * 이 PC가 켜져 있고 이 터널이 살아 있어야
echo     터미널/Grok 없이도 Netlify에서 보드 해시·온도가 보입니다.
echo   * 완전 백그라운드: install-permanent-tunnel.ps1 실행
echo  ========================================
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo  cloudflared 없음 — npx 로 실행합니다...
  npx --yes cloudflared tunnel --url http://%MINER_IP%
) else (
  cloudflared tunnel --url http://%MINER_IP%
)

echo.
echo  터널이 종료되었습니다. 아무 키나 누르면 닫힙니다.
pause
