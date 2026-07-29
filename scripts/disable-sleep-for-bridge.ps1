# SoloPulse — keep PC awake so home bridge can stream miner → Railway
# Safe defaults: AC (plugged in) never sleep/hibernate. Battery left conservative.
# Revert: run with -Revert
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\disable-sleep-for-bridge.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\disable-sleep-for-bridge.ps1 -Revert

param(
  [switch]$Revert
)

$ErrorActionPreference = "Stop"

function Run-PowerCfg([string[]]$PowerArgs) {
  & powercfg.exe @PowerArgs
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Write-Host "  warn: powercfg $($PowerArgs -join ' ') exit $LASTEXITCODE" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "SoloPulse power profile" -ForegroundColor Cyan

if ($Revert) {
  Write-Host "Reverting to balanced timeouts (AC sleep 30m, hibernate 60m)..."
  Run-PowerCfg @("/change", "standby-timeout-ac", "30")
  Run-PowerCfg @("/change", "hibernate-timeout-ac", "60")
  Run-PowerCfg @("/change", "monitor-timeout-ac", "15")
  Run-PowerCfg @("/change", "disk-timeout-ac", "20")
  # try re-enable hibernate file
  Run-PowerCfg @("/hibernate", "on")
  Write-Host "Reverted (approx). You can also use: Control Panel → Power Options" -ForegroundColor Green
  exit 0
}

Write-Host "Applying always-on (plugged-in / AC):"
Write-Host "  - sleep OFF"
Write-Host "  - hibernate OFF (AC)"
Write-Host "  - monitor can still turn off (saves display only)"
Write-Host ""

# Never sleep / hibernate on AC
Run-PowerCfg @("/change", "standby-timeout-ac", "0")
Run-PowerCfg @("/change", "hibernate-timeout-ac", "0")
# Disk can stay awake
Run-PowerCfg @("/change", "disk-timeout-ac", "0")
# Screen off after 10 min is fine (does not kill bridge)
Run-PowerCfg @("/change", "monitor-timeout-ac", "10")

# Battery (laptop): do not force 0 unless plugged — keep mild sleep on battery
Run-PowerCfg @("/change", "standby-timeout-dc", "30")
Run-PowerCfg @("/change", "hibernate-timeout-dc", "60")
Run-PowerCfg @("/change", "monitor-timeout-dc", "5")

# Disable hibernate file (often needs admin — non-fatal)
try {
  & powercfg.exe /hibernate off 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  - hibernate file disabled" -ForegroundColor Green
  } else {
    Write-Host "  - hibernate off skipped (run as Administrator if hybrid-sleep still occurs)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  - hibernate off skipped (admin may be required)" -ForegroundColor Yellow
}

# Prefer High performance scheme if available
$schemes = & powercfg /list 2>$null | Out-String
if ($schemes -match "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c") {
  Run-PowerCfg @("/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c")
  Write-Host "  - High performance scheme activated" -ForegroundColor Green
} else {
  Write-Host "  - High performance scheme not found; using current plan with timeouts=0" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "STANDBYIDLE / HIBERNATEIDLE (AC value 0x0 = never):" -ForegroundColor Cyan
powercfg /query SCHEME_CURRENT SUB_SLEEP 2>$null | Select-String -Pattern "STANDBYIDLE|HIBERNATEIDLE|0x00000000|AC" | Select-Object -First 24

Write-Host ""
Write-Host "Done. PC should stay awake on AC power so SoloPulse bridge keeps streaming." -ForegroundColor Green
Write-Host "Revert later:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\disable-sleep-for-bridge.ps1 -Revert"
Write-Host ""

