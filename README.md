# SoloPulse Intelligence

Universal small solo mining intelligence platform.

**Production:** https://solopulse-production.up.railway.app  
**Device Link guide:** https://solopulse-production.up.railway.app/bridge

## Product model (important)

| Who | What they do |
|-----|----------------|
| **Anyone with the link** | Open site → enter BTC address → **full pool dashboard** (no install) |
| **Anyone who wants live board** (temp, ASIC hashrate) | Same site → download **Device Link** (`.bat`) configured with *their* address → run on *their* home PC |

The website **cannot** reach home miners by itself (private LAN + browser security).  
Device Link is optional; **pool mode is the complete web product.**

Multi-user isolation: `CLIENT_ID` = payout address. User A and User B never share device streams.

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
