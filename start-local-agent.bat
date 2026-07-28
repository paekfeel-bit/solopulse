@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Local Agent — 끄지 마세요

echo.
echo  ========================================
echo   SoloPulse Local Agent
echo  ========================================
echo   집 PC(채굴기와 같은 Wi-Fi)에서 실행
echo   클라우드가 LAN IP를 직접 열지 않습니다.
echo.

if "%SOLOPULSE_CLOUD_URL%"=="" (
  REM Production Railway URL
  set SOLOPULSE_CLOUD_URL=https://solopulse-production.up.railway.app
)
if "%SOLOPULSE_AGENT_KEY%"=="" set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key

echo  CLOUD = %SOLOPULSE_CLOUD_URL%
echo  KEY   = %SOLOPULSE_AGENT_KEY%
echo.

node agent\local-agent.mjs
echo.
echo  Agent stopped.
pause
