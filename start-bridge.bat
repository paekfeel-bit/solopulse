@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Bridge → Railway WS

echo.
echo  ========================================
echo   Local Bridge (Method 1)
echo   NerdQAxe LAN → WebSocket → Railway
echo  ========================================
echo.

if "%RAILWAY_WS%"=="" set RAILWAY_WS=wss://solopulse-production.up.railway.app/ws
if "%SOLOPULSE_AGENT_KEY%"=="" set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
if "%MINER_SUBNET%"=="" set MINER_SUBNET=172.30.1
REM optional: set MINER_IP=172.30.1.50
REM optional: set CLIENT_ID=your-btc-address

echo  WS  = %RAILWAY_WS%
echo  KEY = %SOLOPULSE_AGENT_KEY%
echo.

node bridge\bridge.mjs
pause
