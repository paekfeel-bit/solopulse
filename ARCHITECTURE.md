# Architecture (Production direction)

## Data plane

1. **Miner** (NerdQAxe / AxeOS) on home LAN  
2. **Local Agent** discovers IP, polls `/api/system/info`, normalizes telemetry  
3. **HTTPS** `POST /api/agent/telemetry` with `x-agent-key`  
4. **Web** polls `GET /api/agent/telemetry` every 2s  
5. **Engines** consume hashrate + pool + network difficulty (real math)

## Why previous “device connect” failed

Vercel/Netlify cannot open `172.x`. Temporary Cloudflare tunnels died / IPs changed (DHCP).  
Agent push removes that class of bugs.

## Target Railway topology (next)

- Web service (Next.js)
- Optional realtime worker
- PostgreSQL for history / cases / multi-user

## Security

- Agent key required on ingest
- No secrets in git
- No cloud LAN scan
