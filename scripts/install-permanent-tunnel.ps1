# SoloPulse — Windows 로그온 시 채굴기 cloudflared 터널 자동 시작
# 관리자 PowerShell 권장:  Right-click → Run with PowerShell
# Usage:  .\scripts\install-permanent-tunnel.ps1 [-MinerIp 172.30.1.67]

param(
  [string]$MinerIp = "172.30.1.67"
)

$ErrorActionPreference = "Stop"
$TaskName = "SoloPulse-Miner-Tunnel"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Wrapper = Join-Path $Root "scripts\run-miner-tunnel-hidden.bat"

# Write wrapper bat that uses MinerIp
$bat = @"
@echo off
cd /d "$Root"
where cloudflared >nul 2>&1
if errorlevel 1 (
  npx --yes cloudflared tunnel --url http://$MinerIp
) else (
  cloudflared tunnel --url http://$MinerIp
)
"@
Set-Content -Path $Wrapper -Value $bat -Encoding ASCII

# Remove old task if present
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

$action = "cmd.exe /c `"$Wrapper`""
# At logon, restart if crash — simple schtasks
schtasks /Create /TN $TaskName /TR $action /SC ONLOGON /RL LIMITED /F | Out-Null

Write-Host ""
Write-Host " Installed scheduled task: $TaskName"
Write-Host " Miner: http://$MinerIp"
Write-Host " Wrapper: $Wrapper"
Write-Host ""
Write-Host " Next:"
Write-Host "  1) Start now:  schtasks /Run /TN $TaskName"
Write-Host "  2) Or run:     start-miner-tunnel.bat  (see trycloudflare URL)"
Write-Host "  3) Paste that HTTPS URL into SoloPulse device field on Netlify"
Write-Host "  4) Uninstall:  schtasks /Delete /TN $TaskName /F"
Write-Host ""
Write-Host " Note: quick tunnels get a NEW URL each restart."
Write-Host "       After PC reboot, re-check the URL once (or use named Cloudflare Tunnel)."
Write-Host ""
