@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo === SoloPulse → GitHub (paekfeel-bit/solopulse) ===
git remote set-url origin https://github.com/paekfeel-bit/solopulse.git 2>nul
git status -sb
echo.
set /p MSG=Commit message (empty = auto): 
if "%MSG%"=="" set MSG=chore: update SoloPulse %DATE% %TIME%

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
) else (
  echo No staged changes to commit.
)

git push -u origin main
if errorlevel 1 (
  echo Push failed. Check login: git credential / GitHub token.
  pause
  exit /b 1
)
echo.
echo OK: https://github.com/paekfeel-bit/solopulse
pause
