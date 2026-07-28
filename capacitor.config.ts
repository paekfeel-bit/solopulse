import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Method 2 — hybrid app shell.
 * Production WebView loads Railway UI; Android cleartext + mixed content
 * allow future direct LAN probes via CapacitorHttp / bridge.
 */
const config: CapacitorConfig = {
  appId: "com.solopulse.app",
  appName: "SoloPulse",
  webDir: "public",
  server: {
    // Live Railway app inside WebView
    url: process.env.CAP_SERVER_URL || "https://solopulse-production.up.railway.app",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#0c0a09",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0c0a09",
    },
  },
};

export default config;
