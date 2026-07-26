@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse → Netlify 영구 배포

echo.
echo  ========================================
echo   SoloPulse Netlify 영구 배포
echo  ========================================
echo   1^) 빌드 검증
echo   2^) export zip 생성
echo   3^) netlify-cli production deploy
echo  ========================================
echo.

if not exist "node_modules\" (
  echo [0] npm install...
  call npm install
)

echo [1] 빌드...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)

echo [2] 영구 배포용 zip...
call npm run pack:export

echo [3] Netlify 배포 (로그인 필요)...
echo     최초: npx netlify-cli login
echo     사이트 연결: npx netlify-cli link  또는  sites:create
echo.
call npx --yes netlify-cli deploy --prod --build
if errorlevel 1 (
  echo.
  echo  ---- 수동 대안 ----
  echo  1^) https://app.netlify.com  로그인
  echo  2^) Add new site → Import from Git  ^(권장^)
  echo     또는 CLI: npx netlify-cli login ^&^& npx netlify-cli init
  echo  3^) Build command: npm run build
  echo  4^) Node 20 · publish 비움
  echo  5^) zip 백업: export\solopulse-netlify-READY.zip
  echo  상세: DEPLOY_NETLIFY.txt
  echo.
  pause
  exit /b 1
)

echo.
echo  완료. Netlify URL 로 접속하세요. 터미널/Grok 종료해도 사이트는 유지됩니다.
echo  보드 실측: start-miner-tunnel.bat → URL 을 기기 칸에 저장
pause
