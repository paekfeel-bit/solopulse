# Start cloudflared to miner and set Vercel env DEVICE_TUNNEL_URL
# Usage: powershell -ExecutionPolicy Bypass -File scripts\start-miner-tunnel-sync-vercel.ps1
# Requires: VERCEL_TOKEN env or .vercel-token file (gitignored)

param(
  [string]$MinerIp = "172.30.1.8",
  [string]$VercelToken = $env:VERCEL_TOKEN
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logErr = Join-Path $Root "export\miner-tunnel-live.err.log"
$logOut = Join-Path $Root "export\miner-tunnel-live.out.log"
New-Item -ItemType Directory -Force -Path (Join-Path $Root "export") | Out-Null
Remove-Item $logErr, $logOut -Force -ErrorAction SilentlyContinue

if (-not $VercelToken -and (Test-Path (Join-Path $Root ".vercel-token"))) {
  $VercelToken = (Get-Content (Join-Path $Root ".vercel-token") -Raw).Trim()
}

Write-Host "Starting tunnel to http://$MinerIp ..."
$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx --yes cloudflared tunnel --url http://$MinerIp 1> `"$logOut`" 2> `"$logErr`"" -PassThru -WindowStyle Minimized -WorkingDirectory $Root

$url = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  $text = ""
  if (Test-Path $logErr) { $text += Get-Content $logErr -Raw -ErrorAction SilentlyContinue }
  if (Test-Path $logOut) { $text += Get-Content $logOut -Raw -ErrorAction SilentlyContinue }
  if ($text -match "https://[a-z0-9-]+\.trycloudflare\.com") {
    $url = $Matches[0]
    break
  }
  if ($p.HasExited) { break }
}

if (-not $url) {
  Write-Host "Tunnel URL not found. Keep cloudflared window open and paste URL manually."
  exit 1
}

Write-Host "TUNNEL=$url"
$url | Set-Content (Join-Path $Root "export\miner-tunnel-url.txt") -Encoding ascii

if ($VercelToken) {
  Write-Host "Updating Vercel env..."
  # Use vercel env via CLI
  $env:VERCEL_TOKEN = $VercelToken
  Push-Location $Root
  try {
    # remove old values if any (ignore errors)
    npx --yes vercel@latest env rm DEVICE_TUNNEL_URL production --yes --token $VercelToken 2>$null
    npx --yes vercel@latest env rm NEXT_PUBLIC_DEVICE_TUNNEL production --yes --token $VercelToken 2>$null
    echo $url | npx --yes vercel@latest env add DEVICE_TUNNEL_URL production --token $VercelToken
    echo $url | npx --yes vercel@latest env add NEXT_PUBLIC_DEVICE_TUNNEL production --token $VercelToken
    Write-Host "Env set. Redeploying..."
    npx --yes vercel@latest --prod --yes --token $VercelToken
  } finally {
    Pop-Location
  }
} else {
  Write-Host "No VERCEL_TOKEN — tunnel is running. Paste this into SoloPulse device field:"
  Write-Host $url
}

Write-Host "Done. Tunnel PID=$($p.Id)"
