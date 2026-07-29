# SoloPulse always-on — what works where

## Cloud site (no home PC required)

| Feature | Any phone / other PC |
|---------|----------------------|
| Open dashboard UI | Yes — Railway / CF |
| Network difficulty, BTC price | Yes |
| Pool shares / best share (CKPool etc.) for your BTC address | Yes |
| Last known board snapshot (briefly after bridge dies) | Yes (cloud snapshot) |

**URL:** https://solopulse-production.up.railway.app

## Live ASIC board (LAN miner)

The NerdQAxe is on your **home LAN**. The cloud cannot open `172.30.x.x` by itself.

| Home state | Live hashrate / board shares / temp |
|------------|--------------------------------------|
| PC on + bridge always-on task | Yes |
| Terminal closed, PC on, task installed | Yes |
| PC sleep / powered off | **No** live board (pool stats still Yes) |

Home bridge process:

```text
[NerdQAxe] --LAN--> [this PC bridge] --WSS--> [Railway] --HTTPS--> [phone / other PC]
```

Install always-on (once) — **recommended**:

```text
더블클릭:  C:\Users\우리집\solopulse\install-always-on.bat
```

This does:

1. Windows **Startup** shortcut → bridge watchdog on logon  
2. Starts bridge **now** (minimized)  
3. **Power plan**: AC sleep/hibernate **OFF** (monitor may still blank)

Power only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\disable-sleep-for-bridge.ps1
# revert:
powershell -ExecutionPolicy Bypass -File scripts\disable-sleep-for-bridge.ps1 -Revert
```

Optional admin scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-always-on-bridge.ps1
```

Or double-click: `start-bridge-railway.bat` (window must stay open unless Startup installed).

## Physics limit

**Closing this PC cannot keep a LAN-only miner streaming forever.**  
For true 24/7 board live without this desktop:

- leave a mini-PC / Raspberry Pi / NAS on the same LAN running the bridge, or  
- rely on **pool API** shares (works from cloud only).
