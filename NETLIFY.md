# SoloPulse on Netlify — permanent deploy

**Production URL (canonical):** https://solopulse.netlify.app/  
**Site name:** `solopulse` · **Site ID:** `97a1c26c-f2a1-483e-841a-87a2209cf966`  
(old random subdomain `joyful-snickerdoodle-f82cf8` was renamed — use **solopulse** only)

## What survives after you close the terminal

| Feature | Netlify only | + miner tunnel on home PC |
|---------|--------------|---------------------------|
| Pool hashrate, shares, best share | ✅ | ✅ |
| Solo odds / Monte Carlo / engine | ✅ | ✅ |
| BTC price, mempool, network | ✅ | ✅ |
| Board live hashrate / temp / power | ❌ (LAN blocked) | ✅ via `trycloudflare` URL |

## Deploy (recommended order)

### 1) GitHub → Netlify Import

1. Push this repo (without `node_modules`, `.next`).
2. Netlify → **Add new site** → **Import**.
3. Build command: `npm run build`
4. **Publish directory: `.next`** (required — do **not** use `.` or blank)
5. Node **20**
6. Site URL is permanent; `git push` updates it.

If you see:
`publish directory cannot be the same as the base directory`
→ Site settings → Build & deploy → Publish directory = `.next` → Clear cache and deploy site.

### 2) CLI

```bat
deploy-netlify.bat
```

or

```bat
npx netlify-cli login
npm run deploy:netlify
```

### 3) Export zip (source backup)

```bat
npm run pack:export
```

→ `export/solopulse-netlify-READY.zip`

**Do not** rely on drag-drop alone for Next.js App Router + `/api`.

## Board hashrate on the permanent site

```bat
start-miner-tunnel.bat
```

Paste `https://….trycloudflare.com` into the device field → **Link device**.

Optional auto-start at Windows logon:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-permanent-tunnel.ps1 -MinerIp 172.30.1.67
```

Quick tunnels mint a **new URL** after reboot — update the device field once, or use a named Cloudflare Tunnel for a fixed hostname.

## Updates

See [UPDATE.md](./UPDATE.md). Short path:

```bat
update-and-deploy.bat
```

## Security notes

- No private API keys in the repo.
- `/api/device` allowlists LAN + known tunnel hostnames (SSRF guard).
- Keep Next.js on patched 15.5.x (`package.json`).
