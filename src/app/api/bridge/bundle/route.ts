import { NextRequest, NextResponse } from "next/server";
import { toClientId } from "@/lib/clientId";

export const dynamic = "force-dynamic";

/**
 * Returns a ready-to-run Windows .bat that launches the bridge with this user's clientId.
 * Third parties: open site → enter address → download → run on home PC once.
 *
 * GET /api/bridge/bundle?clientId=bc1q...&format=bat|json|ps1
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const clientId = toClientId(sp.get("clientId") || sp.get("address") || "default");
  const format = (sp.get("format") || "bat").toLowerCase();
  const cloud =
    process.env.SOLOPULSE_PUBLIC_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "https://solopulse-production.up.railway.app");
  const ws = cloud.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
  const key =
    process.env.SOLOPULSE_AGENT_KEY ||
    process.env.AGENT_KEY ||
    "solopulse-local-dev-key";
  const subnet = sp.get("subnet") || "172.30.1";
  const minerIp = sp.get("minerIp") || "";

  if (format === "json") {
    return NextResponse.json({
      CLIENT_ID: clientId,
      RAILWAY_WS: ws,
      SOLOPULSE_CLOUD_URL: cloud,
      SOLOPULSE_AGENT_KEY: key,
      MINER_SUBNET: subnet,
      MINER_IP: minerIp,
      note: "Run: npx --yes github:medbedee/solopulse#main  OR clone repo and npm run bridge",
    });
  }

  if (format === "ps1") {
    const ps1 = `# SoloPulse Device Link — auto-configured for ${clientId}
# Run on the PC that is on the SAME Wi-Fi as your NerdQAxe / AxeOS miner.
$ErrorActionPreference = "Stop"
$env:CLIENT_ID = "${clientId}"
$env:RAILWAY_WS = "${ws}"
$env:SOLOPULSE_CLOUD_URL = "${cloud}"
$env:SOLOPULSE_AGENT_KEY = "${key}"
$env:MINER_SUBNET = "${subnet}"
${minerIp ? `$env:MINER_IP = "${minerIp}"` : "# $env:MINER_IP = \"192.168.1.50\"  # optional fixed IP"}
Write-Host "SoloPulse Bridge → $env:RAILWAY_WS"
Write-Host "CLIENT_ID = $env:CLIENT_ID"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js required: https://nodejs.org" -ForegroundColor Red
  exit 1
}
$root = Join-Path $env:TEMP "solopulse-bridge"
if (-not (Test-Path (Join-Path $root "bridge\\bridge.mjs"))) {
  Write-Host "Cloning SoloPulse bridge..."
  if (Test-Path $root) { Remove-Item $root -Recurse -Force }
  git clone --depth 1 https://github.com/medbedee/solopulse.git $root
  Push-Location $root
  npm install --omit=dev --no-audit --no-fund
  Pop-Location
}
Set-Location $root
node bridge/bridge.mjs
`;
    return new NextResponse(ps1, {
      headers: {
        "Content-Type": "application/octet-stream; charset=utf-8",
        "Content-Disposition": `attachment; filename="SoloPulse-Bridge-${clientId.slice(0, 12)}.ps1"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // default: .bat (Windows one-click)
  const bat = `@echo off
chcp 65001 >nul
title SoloPulse Bridge - Device Link
echo.
echo  ========================================
echo   SoloPulse Device Link (from website)
echo   CLIENT_ID = ${clientId}
echo  ========================================
echo.
echo  This PC must be on the SAME Wi-Fi as your miner.
echo  Keep this window open while you use the website.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

set CLIENT_ID=${clientId}
set RAILWAY_WS=${ws}
set SOLOPULSE_CLOUD_URL=${cloud}
set SOLOPULSE_AGENT_KEY=${key}
set MINER_SUBNET=${subnet}
${minerIp ? `set MINER_IP=${minerIp}` : "rem set MINER_IP=192.168.1.50"}

set ROOT=%TEMP%\\solopulse-bridge
if not exist "%ROOT%\\bridge\\bridge.mjs" (
  echo First run: downloading bridge...
  where git >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] git not found. Install Git for Windows, or copy the solopulse folder here.
    pause
    exit /b 1
  )
  if exist "%ROOT%" rmdir /s /q "%ROOT%"
  git clone --depth 1 https://github.com/medbedee/solopulse.git "%ROOT%"
  pushd "%ROOT%"
  call npm install --omit=dev --no-audit --no-fund
  popd
)

cd /d "%ROOT%"
node bridge\\bridge.mjs
pause
`;

  return new NextResponse(bat, {
    headers: {
      "Content-Type": "application/octet-stream; charset=utf-8",
      "Content-Disposition": `attachment; filename="SoloPulse-Bridge.bat"`,
      "Cache-Control": "no-store",
    },
  });
}
