@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Bridge - Device Link

echo.
echo  ========================================
echo   SoloPulse Device Link (optional)
echo   Home miner -^> Railway -^> website
echo  ========================================
echo.
echo  Website alone = pool mode (no this file).
echo  This window = live board for YOUR address.
echo  CLIENT_ID must match the address you type on the site.
echo.
echo  Third parties: open /bridge on the website and download .bat
echo.

if "%RAILWAY_WS%"=="" set RAILWAY_WS=wss://solopulse-production.up.railway.app/ws
if "%SOLOPULSE_AGENT_KEY%"=="" set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
if "%MINER_SUBNET%"=="" set MINER_SUBNET=172.30.1
if "%CLIENT_ID%"=="" set CLIENT_ID=default
REM set MINER_IP=172.30.1.33
REM set CLIENT_ID=bc1qYourPayoutAddressHere

echo  WS        = %RAILWAY_WS%
echo  CLIENT_ID = %CLIENT_ID%
echo  SUBNET    = %MINER_SUBNET%
echo.

node bridge\bridge.mjs
pause
