@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ========================================
echo   SoloPulse always-on 설치
echo  ========================================
echo   1) Windows 시작 시 브리지 자동 실행
echo   2) 지금 브리지 워치독 시작
echo   3) 절전 방지 (AC 전원: sleep/hibernate OFF)
echo  ========================================
echo.

echo [1/3] Startup 바로가기...
powershell -ExecutionPolicy Bypass -Command ^
  "$startup=[Environment]::GetFolderPath('Startup'); $cmd=Join-Path '%CD%' 'scripts\run-bridge-watchdog.cmd'; $lnk=Join-Path $startup 'SoloPulseBridgeAlwaysOn.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath='cmd.exe'; $s.Arguments='/c \"'+$cmd+'\"'; $s.WorkingDirectory='%CD%'; $s.WindowStyle=7; $s.Description='SoloPulse bridge always-on'; $s.Save(); Write-Host 'OK' $lnk"

echo.
echo [2/3] 브리지 워치독 시작...
start "SoloPulse Bridge" /min cmd /c "%CD%\scripts\run-bridge-watchdog.cmd"

echo.
echo [3/3] 절전 방지 전원 설정...
powershell -ExecutionPolicy Bypass -File "%CD%\scripts\disable-sleep-for-bridge.ps1"
if errorlevel 1 (
  echo.
  echo  절전 설정 일부 실패 가능 — 관리자 PowerShell로 다시 실행:
  echo    scripts\disable-sleep-for-bridge.ps1
)

echo.
echo  ========================================
echo   완료
echo  ========================================
echo   사이트: https://solopulse-production.up.railway.app
echo   터미널 닫아도 됨. PC는 켜 두세요 (절전 OFF 적용).
echo   되돌리기: scripts\disable-sleep-for-bridge.ps1 -Revert
echo  ========================================
echo.
pause
