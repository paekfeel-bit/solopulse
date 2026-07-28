# SoloPulse Intelligence

Universal small solo mining intelligence platform.

**Production:** https://solopulse-production.up.railway.app  
**Device Link guide:** https://solopulse-production.up.railway.app/bridge

## Product model (link only)

**Third parties (shared link): open on phone or PC — no bridge, no app download.**

| Who | What they do |
|-----|----------------|
| **Anyone with the link** | Browser → enter BTC address → full dashboard from **solo pool APIs** |
| Mobile | Same link, no install |
| PC | Same link, no install |

Home-miner “board temp / ASIC direct” requires a local agent and is **not** part of the shared-link product.

## Architecture

```
Phone / PC browser  ──HTTPS──▶  Railway (Next.js + /ws)
        │                              ▲
        │ pool APIs                    │ optional push
        ▼                              │
   CKPool / public stats     Home PC: Device Link (.bat from /bridge)
                                       │
                                       ▼
                                  NerdQAxe (LAN only)
```

## Quick start

### Web only (third parties)

Open https://solopulse-production.up.railway.app — enter address.

### Optional Device Link

1. Open https://solopulse-production.up.railway.app/bridge  
2. Paste your mining address  
3. Download Windows `.bat`  
4. Run on the PC that shares Wi‑Fi with the miner (keep window open)

Or if you already cloned this repo:

```bat
set CLIENT_ID=bc1qYOUR_ADDRESS
start-bridge.bat
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
| Gauges | Analog cluster |
| Engine | Source engine live |
| Odds | Poisson odds / cases |
| Chart | Hashrate history |
| Net | Network / mempool |
| Agent | Pool vs Device Link |

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [BRIDGE.md](./BRIDGE.md)
- [LOCAL_AGENT.md](./LOCAL_AGENT.md)
- [CAPACITOR.md](./CAPACITOR.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

## License

Private / personal project unless stated otherwise.
