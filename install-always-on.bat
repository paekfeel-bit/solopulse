@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  SoloPulse always-on install
echo  1) Startup shortcut (no admin)
echo  2) Optional: admin scheduled task
echo.
powershell -ExecutionPolicy Bypass -Command ^
  "$startup=[Environment]::GetFolderPath('Startup'); $cmd=Join-Path '%CD%' 'scripts\run-bridge-watchdog.cmd'; $lnk=Join-Path $startup 'SoloPulseBridgeAlwaysOn.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath='cmd.exe'; $s.Arguments='/c \"'+$cmd+'\"'; $s.WorkingDirectory='%CD%'; $s.WindowStyle=7; $s.Save(); Write-Host 'OK Startup:' $lnk"

echo.
echo  Starting bridge watchdog now...
start "SoloPulse Bridge" /min cmd /c "%CD%\scripts\run-bridge-watchdog.cmd"

echo.
echo  Done. Mobile site: https://solopulse-production.up.railway.app
echo  Keep this PC ON (sleep off recommended) for live board.
echo  Terminal can close; bridge runs minimized via Startup.
echo.
pause
