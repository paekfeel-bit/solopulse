@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
title SoloPulse Bridge Watchdog

set MINER_SUBNET=172.30.1
set RAILWAY_WS=wss://solopulse-api.paekfeel.workers.dev/ws
set SOLOPULSE_WS=wss://solopulse-api.paekfeel.workers.dev/ws
set SOLOPULSE_API_URL=https://solopulse-api.paekfeel.workers.dev
set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
set CLIENT_ID=default
set POLL_MS=2500
set SOLOPULSE_CLOUD_URL=https://solopulse.paekfeel.workers.dev

if not exist "node_modules\" call npm install --no-audit --no-fund

:loop
echo [%date% %time%] starting bridge...
node bridge\bridge.mjs
echo [%date% %time%] bridge exited %ERRORLEVEL% — restart in 5s
timeout /t 5 /nobreak >nul
goto loop
