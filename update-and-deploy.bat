@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse — 수정 반영 + Netlify 업데이트

echo.
echo  ========================================
echo   SoloPulse 업데이트 → Netlify 영구 사이트
echo  ========================================
echo.

if not exist "node_modules\" (
  echo [0] npm install...
  call npm install
  if errorlevel 1 (
    echo npm install FAILED
    pause
    exit /b 1
  )
)

echo [1] 프로덕션 빌드 검증...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED — 배포 중단
  pause
  exit /b 1
)

echo [2] 배포용 zip 백업 생성...
call npm run pack:export
if errorlevel 1 (
  echo pack:export 경고 — CLI 배포는 계속 시도합니다.
)

echo [3] Netlify production 배포...
echo     최초 1회: npx netlify-cli login
echo.
call npx --yes netlify-cli deploy --prod --build
if errorlevel 1 (
  echo.
  echo  CLI 배포 실패 시:
  echo   1^) npx netlify-cli login
  echo   2^) npx netlify-cli link
  echo   3^) 이 배치 다시 실행
  echo   또는 GitHub 연동 사이트면 git push 만 하면 자동 배포됩니다.
  echo.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   업데이트 완료
echo   · Netlify URL 은 그대로 · 내용만 갱신됨
echo   · 보드 실측이 필요하면 start-miner-tunnel.bat
echo  ========================================
echo.
pause
