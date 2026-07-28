# SoloPulse Device Link (Bridge)

## Can the bridge live *inside* the website?

**No — not as pure browser JavaScript on the cloud site.**

Reasons:

1. Cloud cannot open private IPs (`192.168.x`, `172.x`)
2. HTTPS page cannot fetch `http://miner` (Mixed Content)
3. AxeOS usually has no CORS

What we *did* instead (product-complete):

- **Web = complete** for pool monitoring (link only)
- **Device Link download** is generated **by the site** (`/bridge`, `/api/bridge/bundle`) with your address baked in
- Same domain product: UI + one-click companion

## Multi-user

`CLIENT_ID` must equal the BTC address used on the website.

```
User A address → Bridge CLIENT_ID=A → only A sees board data
User B address → Bridge CLIENT_ID=B → only B sees board data
```

## Run (repo already on disk)

```bat
set CLIENT_ID=bc1q...
set MINER_SUBNET=172.30.1
start-bridge.bat
```

## Run (third party, from website)

1. https://solopulse-production.up.railway.app/bridge  
2. Download `.bat`  
3. Need Node.js (+ Git on first run)  
4. Keep window open  

## Capacitor (Method 2)

Native app on same Wi‑Fi can talk to LAN without Mixed Content — see [CAPACITOR.md](./CAPACITOR.md). Still not a pure browser cloud page.
