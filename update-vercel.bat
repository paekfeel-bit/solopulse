@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse → Vercel 업데이트

echo.
echo  SoloPulse 수정 반영 → Vercel 재배포
echo.

if not exist "node_modules\" call npm install

call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)

call npx --yes vercel@latest --prod --yes
if errorlevel 1 (
  echo.
  echo  로그인 필요: npx vercel login
  pause
  exit /b 1
)

echo.
echo  업데이트 완료.
pause
