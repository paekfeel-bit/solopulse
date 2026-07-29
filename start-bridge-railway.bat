@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Bridge → Cloudflare (끄지 마세요)

echo.
echo  ========================================
echo   SoloPulse 집 PC 브리지 (Cloudflare)
echo  ========================================
echo   API/WS: solopulse-api.paekfeel.workers.dev
echo   모바일: https://solopulse.paekfeel.workers.dev
echo  ========================================
echo.

if not exist "node_modules\" call npm install

set MINER_SUBNET=172.30.1
set RAILWAY_WS=wss://solopulse-api.paekfeel.workers.dev/ws
set SOLOPULSE_WS=wss://solopulse-api.paekfeel.workers.dev/ws
set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
set CLIENT_ID=default
set POLL_MS=2500
set SOLOPULSE_CLOUD_URL=https://solopulse.paekfeel.workers.dev

node bridge\bridge.mjs
echo.
echo  브리지가 종료되었습니다.
pause
