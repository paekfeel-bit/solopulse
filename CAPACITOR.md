# SoloPulse Capacitor (Method 2)

Hybrid Android/iOS shell around SoloPulse.

## Why

Browser on HTTPS cannot call `http://192.168.x.x` (Mixed Content + CORS).  
Native WebView with cleartext + `allowMixedContent` can.

## Setup

```bash
npm install
npm run build
npx cap add android
# optional: npx cap add ios   (macOS only)

# Copy network security config
# android/app/src/main/res/xml/network_security_config.xml
# from android-network-security-config.xml

npx cap sync android
npx cap open android
```

In `AndroidManifest.xml` application tag:

```xml
android:usesCleartextTraffic="true"
android:networkSecurityConfig="@xml/network_security_config"
```

## Production server URL

`capacitor.config.ts` → `server.url` points at:

```
https://solopulse-production.up.railway.app
```

Override:

```bash
set CAP_SERVER_URL=https://your-host
npx cap sync
```

## Still recommended

Keep **Method 1 bridge** (`start-bridge.bat`) for reliable real-time push when the phone is off-LAN (mobile data).  
Capacitor direct LAN works best when phone is on the same Wi‑Fi as the miner.

## Store fees

- Google Play Console: one-time ~$25  
- Apple Developer: ~$99/year  
