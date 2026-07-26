@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse → Vercel (Netlify 대안 · 무료 Hobby)

echo.
echo  ========================================
echo   SoloPulse Vercel 영구 배포
echo   (Netlify 크레딧 없을 때 권장)
echo  ========================================
echo.

if not exist "node_modules\" (
  echo [0] npm install...
  call npm install
)

echo [1] 프로덕션 빌드 확인...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)

echo.
echo [2] Vercel 배포...
echo     최초 1회: 브라우저 로그인 창이 뜹니다.
echo     프로젝트 이름 예: solopulse
echo.

call npx --yes vercel@latest --prod --yes
if errorlevel 1 (
  echo.
  echo  실패 시 수동:
  echo    npx vercel login
  echo    npx vercel --prod
  echo.
  echo  또는 크레딧 0원: start-solopulse.bat
  echo.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   완료. 터미널에 나온 https://….vercel.app 사용
echo   이후 업데이트:  update-vercel.bat
echo   보드 실측:     start-miner-tunnel.bat
echo  ========================================
echo.
pause
