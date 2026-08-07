# SoloPulse Capacitor (Android + iOS App Store)

Hybrid native shell around SoloPulse live web UI.

## Production URL

`capacitor.config.ts` → `server.url`:

```
https://solopulse.paekfeel.workers.dev
```

Override:

```bash
# Windows
set CAP_SERVER_URL=https://solopulse.paekfeel.workers.dev
npx cap sync
```

## Android (this PC)

```bash
npm install
npx cap sync android
npx cap open android
```

Cleartext / mixed content enabled for optional LAN miner probes.

## iOS (Mac required)

```bash
npm install
npx cap add ios      # once
npx cap sync ios
npx cap open ios     # Xcode → Archive → App Store
```

Full App Store checklist: **[APPLE_APP_STORE.md](./APPLE_APP_STORE.md)**

## Why native shell

| | Web only | Capacitor app |
|--|----------|----------------|
| App Store | ❌ | ✅ |
| Home icon | PWA limited | Official |
| HTTPS→LAN miner | Blocked | Better (plugins / cleartext) |
| UI updates | Instant deploy | Instant (loads live URL) |

## Store fees

- Google Play: ~$25 one-time  
- Apple Developer: **$99 / year**
