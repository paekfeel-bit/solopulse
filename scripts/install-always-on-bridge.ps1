# Install SoloPulse home bridge as always-on Windows Scheduled Task
# - Survives terminal close
# - Starts at user logon
# - Auto-restarts on crash
# Does NOT work if this PC is powered off / sleeping (physics: miner is on LAN).
#
# Usage (recommended): right-click PowerShell → Run as Administrator
#   powershell -ExecutionPolicy Bypass -File scripts\install-always-on-bridge.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "SoloPulseBridgeAlwaysOn"
$Watchdog = Join-Path $Root "scripts\run-bridge-watchdog.cmd"

if (-not (Test-Path $Watchdog)) {
  throw "Missing $Watchdog"
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  throw "Node.js not found in PATH. Install Node 20+ first."
}
$node = $nodeCmd.Source

# Remove old task
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$Watchdog`"" `
  -WorkingDirectory $Root

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
# Also try start now
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggerLogon `
  -Settings $settings `
  -Principal $principal `
  -Description "SoloPulse: LAN miner → Railway WSS (always-on while PC is on)" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Installed: Scheduled Task '$TaskName'" -ForegroundColor Green
Write-Host "  Root:     $Root"
Write-Host "  Watchdog: $Watchdog"
Write-Host "  Cloud UI: https://solopulse-production.up.railway.app"
Write-Host ""
Write-Host "What this guarantees:"
Write-Host "  [OK] Terminal closed  → bridge keeps running"
Write-Host "  [OK] User reboots PC  → bridge starts at logon"
Write-Host "  [OK] Mobile / other PC → site works (Railway cloud)"
Write-Host "  [NO] This PC powered OFF/sleep → live board stream stops"
Write-Host "       (pool shares/network still work on the website)"
Write-Host ""
Write-Host "Status:  Get-ScheduledTask -TaskName $TaskName"
Write-Host "Remove:  Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
