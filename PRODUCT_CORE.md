# SoloPulse product core — permanent live mining contact

## User promise

1. Enter **wallet**, **pool**, optional **device IP**
2. On **any phone/PC with internet** (not only home WiFi):
   - Live hashrate
   - Live odds / source engine / intelligence engine (not idle)
3. When home agent runs: also **board temperature** + exact AxeOS stats

## Why previous design failed

Source Engine was hard-coded to **board-only**.  
If the home bridge blipped → `BOARD OFFLINE` → entire product felt dead  
even while CKPool still had live hashrate for the same wallet.

## Correct ground truth

| Signal | Source | Works outside home WiFi? |
|--------|--------|---------------------------|
| Hashrate, shares, best share | **Pool API** (wallet+pool) | **Yes — always** |
| Hashrate, temp, power | **Home agent → Cloudflare SoloRoom** | Yes (agent PC must be on) |
| Source / Intelligence engines | `max(board, pool)` hashrate | **Yes when pool OR board live** |

## Permanent architecture

```
[User phone/PC anywhere]
        │ HTTPS
        ▼
[UI: solopulse.paekfeel.workers.dev  or Railway until OpenNext ships]
        │
        ├─ /api/miner/{wallet}  → CKPool (global)
        └─ /api/agent/telemetry → Cloudflare SoloRoom DO
                                      ▲
                                      │ WSS + HTTP every 2.5s
                               [Home agent on LAN]
                                      ▲
                               [NerdQAxe 172.30.x.x]
```

## Forever on home PC

```text
install-always-on.bat
```

- Startup watchdog
- Sleep off (AC)
- Bridge → **only** `solopulse-api.paekfeel.workers.dev`

## Physics

If home PC is **powered off**, board temp stops.  
**Pool path + source engine still run** for the same mining wallet.
