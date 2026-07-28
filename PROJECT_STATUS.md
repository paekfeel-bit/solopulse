# SoloPulse Intelligence — rebuild status

Date: 2026-07-28

## Done (this rebuild pass)

- **Local Agent path** (correct production model): `agent/local-agent.mjs` + `start-local-agent.bat`
- **Cloud ingest**: `/api/agent/telemetry`, `/api/agent/heartbeat`, file/memory store
- **Dashboard prefers Agent telemetry** over broken cloud→LAN proxy
- **Analog instrument cluster** (hashrate / temp / power gauges)
- **Source Engine live animation** driven by real Poisson λ + live hashrate
- Warm tube / stone retro visual base

## Connection rule (non-negotiable)

Cloud **must not** scan or open user private IPs.  
Device data only via **Local Agent push**.

## Still to expand (master prompt backlog)

- Full monorepo (`apps/web`, `apps/backend`, `apps/worker`, `packages/*`)
- PostgreSQL on Railway + multi-user auth
- WebSocket realtime channel
- Success Forensics full dataset pipeline
- Journey engine polish
- GitHub remote + Railway multi-service deploy

## How to run now

1. Deploy web (Vercel or Railway)
2. On home PC: `start-local-agent.bat` (same Wi‑Fi as miner)
3. Open dashboard — AGENT STREAMING + gauges should go live
