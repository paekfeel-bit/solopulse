# Local Bridge + Railway WebSocket (Method 1)

```
[Phone HTTPS] → [Railway SoloPulse UI + /ws]
                      ↑ wss bridge
            [PC/RPi bridge.mjs]
                      ↑ http
                 [NerdQAxe LAN]
```

## Run bridge (home PC)

```bat
start-bridge.bat
```

Env (optional):

```bat
set MINER_IP=172.30.1.50
set MINER_SUBNET=172.30.1
set RAILWAY_WS=wss://solopulse-production.up.railway.app/ws
set SOLOPULSE_AGENT_KEY=solopulse-local-dev-key
set CLIENT_ID=bc1youraddress
```

## Railway server

`npm start` → `node server.mjs`  
Serves Next.js + WebSocket on path `/ws`.

- Bridge: `?role=bridge&key=...&clientId=...`
- Browser: `?role=browser&clientId=...`

Bridge packets also write `/api/agent/telemetry` snapshot so REST UI keeps working.
