# SoloPulse

Real-time **solo mining radar** for small ASIC / Bitaxe / NerdQAxe miners on CKPool.

Not a toy probability calculator — odds use the actual SHA-256 block-finding model:

\[
P(\text{hash is block}) \approx \frac{1}{D \cdot 2^{32}}, \quad
E[\text{time}] = \frac{D \cdot 2^{32}}{h}, \quad
P(\ge 1 \text{ in } t) = 1 - e^{-\lambda t}
\]

## Features

- Paste BTC payout address → auto-load CKPool stats (US / EU / AU / SG)
- Live hashrate, workers, last share, total shares, best share / best ever
- Board live hashrate / temp / power (AxeOS proxy + soft-fail if offline)
- Block odds: 1 day / week / month / year (Poisson) + Monte Carlo engine
- Hashrate history chart (local samples)
- BTC price, difficulty, block reward, network hashrate
- Browser notifications + block celebration (≥61°C board alert)
- **PWA** — install to home screen (iOS / Android / desktop)

## Permanent deploy (Netlify) — terminal can close

**Live (was Netlify):** https://solopulse.netlify.app/ — if credits ran out, use Vercel or home PC.

See **[DEPLOY_ALTERNATIVES.txt](./DEPLOY_ALTERNATIVES.txt)** (Vercel / 집 PC 무료).

```bat
deploy-vercel.bat
```

Netlify (크레딧 있을 때만): `deploy-netlify.bat`  
완전 무료 지금 당장: `start-solopulse.bat`

| After terminal closes | Status |
|----------------------|--------|
| Pool, odds, price, charts | ✅ Netlify keeps serving |
| Board live hash / temp | Needs home PC `start-miner-tunnel.bat` URL in device field |

**Updates** (edit this folder anytime): **[UPDATE.md](./UPDATE.md)** → `update-and-deploy.bat` or `git push`.

```bat
npm run pack:export
```

→ `export/solopulse-netlify-READY.zip`

## Local run

```bash
cd solopulse
npm install
npm run build
npm run start
```

- LAN board: [http://localhost:3000](http://localhost:3000) or `start-solopulse.bat`
- Device IP example: `172.30.1.67` (check AxeOS — DHCP changes)

### Public HTTPS (app tunnel)

```bat
start-solopulse.bat
```

### Miner-only tunnel (for Netlify board live)

```bat
start-miner-tunnel.bat
```

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- APIs: CKPool, mempool.space, Coinbase spot; device via `/api/device` (SSRF-guarded)

## Your setup

- Address: `bc1qu9r9k2tcjkva0hjr8p3yuvy9pjc45lwsh2al56`
- Pool: CKPool solo
- Device: NerdQAxe++ (BM1370)
