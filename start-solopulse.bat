@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse — 집 PC 서버 + 공개 터널

echo.
echo  ========================================
echo   SoloPulse 로컬 실행 (LAN 보드 실측)
echo  ========================================
echo   · 이 PC + 채굴기 같은 Wi‑Fi 일 때 가장 안정
echo   · 영구 클라우드는 deploy-netlify.bat / Netlify Git
echo  ========================================
echo.

if not exist "node_modules\" (
  echo  npm install...
  call npm install
)

echo  [1] 빌드...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)

echo  [2] 포트 3000 정리...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  [3] 서버 시작 http://localhost:3000
start "SoloPulse Server" cmd /k "cd /d %~dp0 && set PORT=3000 && npm run start"
timeout /t 4 /nobreak >nul

echo  [4] Cloudflare 공개 터널 (앱 접속용)...
start "SoloPulse App Tunnel" cmd /k "cd /d %~dp0 && npx --yes cloudflared tunnel --url http://localhost:3000"

echo.
echo  --------------------------------------
echo   사용 방법
echo  --------------------------------------
echo   1. 터널 창의 https://....trycloudflare.com 으로 접속
echo      또는 집 안: http://localhost:3000
echo   2. 기기 IP: AxeOS 화면 IP (예: 172.30.1.67)
echo   3. [기기 연결] 또는 [자동 검색]
echo.
echo   * Netlify 영구 배포 + 보드만 터널:
echo       deploy-netlify.bat  후  start-miner-tunnel.bat
echo   * 업데이트: update-and-deploy.bat / UPDATE.md
echo  --------------------------------------
echo.
pause
