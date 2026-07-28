# SoloPulse — Project Status

**Date:** 2026-07-28  
**Production:** https://solopulse-production.up.railway.app  
**GitHub (target):** https://github.com/medbedee/solopulse  

## Implemented: Method 1 + Method 2

### Method 1 — Local Bridge → Railway WebSocket ⭐

| Piece | Path | Status |
|-------|------|--------|
| Custom server (Next + WS `/ws`) | `server.mjs` | ✅ Running on Railway |
| Agent store dual-write | `server-agent-store.mjs` | ✅ |
| Local Bridge (LAN poll → wss) | `bridge/bridge.mjs` | ✅ |
| One-click starter | `start-bridge.bat` | ✅ |
| Browser client | `useAgentTelemetry.ts` | ✅ WS + HTTP fallback |
| HTTP agent path | `agent/local-agent.mjs` | ✅ |
| Docker host | `Dockerfile` + `railway.json` | ✅ SUCCESS deploy |

**Runtime log (Railway):**
```
> SoloPulse http://0.0.0.0:8080
> WebSocket /ws (bridge|browser)
```

**How to use:**
1. Open https://solopulse-production.up.railway.app  
2. On home PC (same LAN as miner): double-click `start-bridge.bat`  
3. Dashboard bottom tab **Agent** / gauges show live device hashrate  

### Method 2 — Capacitor hybrid ⭐⭐

| Piece | Path | Status |
|-------|------|--------|
| Capacitor config (Railway URL + cleartext) | `capacitor.config.ts` | ✅ |
| Android project | `android/` | ✅ |
| Cleartext / LAN HTTP | `android/.../network_security_config.xml` | ✅ |
| Manifest usesCleartextTraffic | `AndroidManifest.xml` | ✅ |
| Docs | `CAPACITOR.md` | ✅ |

**Build APK (Android Studio):**
```bash
npm install
npx cap sync android
npx cap open android
```

### UI

- Bottom tab nav (`BottomNav.tsx`): Gauges · Engine · Odds · Chart · Net · Agent  
- Analog gauges + Source Engine Live  

## Architecture constraint (permanent)

Cloud **never** opens private IPs (`172.x` / `192.168.x`).  
Only **home Agent/Bridge pushes** telemetry to Railway.

## Deploy

```bash
npx railway up -y
# or: npm run deploy:railway
```

Linked Railway project: `solopulse` (production)  
Start command: `node server.mjs`

## GitHub

Local `main` has full source. Push requires your GitHub credentials:

```bash
cd solopulse
git push -u origin main
```

Desktop archive: `solopulse-FULL-SOURCE.zip`

## Env (optional)

| Var | Default |
|-----|---------|
| `SOLOPULSE_AGENT_KEY` | `solopulse-local-dev-key` |
| `RAILWAY_WS` | `wss://solopulse-production.up.railway.app/ws` |
| `MINER_IP` / `MINER_SUBNET` | auto / `172.30.1` |
| `CLIENT_ID` | `default` (or your BTC address) |
