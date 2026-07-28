# SoloPulse Intelligence

Universal small solo mining intelligence platform.

**Production (Railway):** https://solopulse-production.up.railway.app

## Architecture

```
Phone (HTTPS UI + WebSocket)
        │
        ▼
Railway (Next.js + /ws)
        ▲
        │ wss bridge  OR  HTTPS agent POST
        │
Home PC: start-bridge.bat  /  start-local-agent.bat
        │
        ▼
NerdQAxe / AxeOS (LAN only — cloud never opens 172.x)
```

### Why not “enter IP in the website”?

1. Cloud cannot reach private LAN IPs  
2. HTTPS pages block HTTP miner (Mixed Content)  
3. AxeOS usually has no CORS  

## Quick start

### Web (already on Railway)

Open: https://solopulse-production.up.railway.app

### Local bridge (Method 1 — recommended)

```bat
start-bridge.bat
```

### Local agent (HTTP push fallback)

```bat
start-local-agent.bat
```

### Capacitor Android (Method 2)

See [CAPACITOR.md](./CAPACITOR.md)

```bash
npx cap open android
```

### Dev

```bash
npm install
npm run build
npm start   # node server.mjs (Next + WebSocket)
```

## Bottom navigation

| Tab | Content |
|-----|---------|
| ◎ Gauges | Analog cluster |
| ⚡ Engine | Source engine live |
| 🎲 Odds | Poisson odds / cases |
| 📈 Chart | Hashrate history |
| 🌐 Net | Network / mempool |
| 📡 Agent | Bridge / agent setup |

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [BRIDGE.md](./BRIDGE.md)
- [LOCAL_AGENT.md](./LOCAL_AGENT.md)
- [CAPACITOR.md](./CAPACITOR.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

## License

Private / personal project unless stated otherwise.
