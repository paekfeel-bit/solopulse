@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Device Bridge — 끄지 마세요

echo.
echo  ========================================
echo   SoloPulse 기기 브리지 (영구 연결)
echo  ========================================
echo   * 채굴기 IP가 바뀌어도 자동 검색
echo   * Cloudflare 터널 자동 유지/재시작
echo   * Vercel 사이트에 터널 주소 자동 등록
echo.
echo   이 창을 닫으면 Vercel 보드 연결이 끊깁니다.
echo   PC 켤 때마다 이 파일을 실행하세요.
echo  ========================================
echo.

if not exist "node_modules\" call npm install

node scripts\device-bridge.mjs
echo.
echo  브리지가 종료되었습니다.
pause
