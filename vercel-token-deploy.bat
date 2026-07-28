@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SoloPulse Vercel token deploy
echo.
echo  https://vercel.com/account/tokens 에서 토큰 생성 후 붙여넣기
echo.
set /p VERCEL_TOKEN=VERCEL TOKEN: 
if "%VERCEL_TOKEN%"=="" ( echo no token & pause & exit /b 1 )
call npx --yes vercel@latest --prod --yes --token %VERCEL_TOKEN%
pause
