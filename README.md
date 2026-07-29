# SoloPulse

Bitcoin solo mining monitor — live board hashrate, analog gauges, Source Engine, local bridge.

## Stack

- Next.js 15 + TypeScript
- Local bridge (`bridge/bridge.mjs`) for LAN miners
- Optional Cloudflare rebuild in sibling `solopulse-cf` (WIP)

## Dev

```bash
npm install
npm run dev
```

## Bridge

```bash
npm run bridge
# or start-bridge.bat
```

## Version

See `src/lib/version.ts`. Bump: `npm run version:bump`

## Deploy

Historical Railway deploy via `npm run deploy:railway`. Prefer your own host/CF going forward.

Repo: https://github.com/paekfeel-bit/solopulse
