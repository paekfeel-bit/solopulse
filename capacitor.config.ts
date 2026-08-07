import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SoloPulse hybrid shell (Android + iOS App Store).
 * WebView loads the live Cloudflare primary URL (pool mining monitor).
 * Native shell enables App Store packaging + future LAN plugins.
 */
const LIVE_URL =
  process.env.CAP_SERVER_URL || "https://solopulse.paekfeel.workers.dev";

const config: CapacitorConfig = {
  appId: "com.solopulse.app",
  appName: "SoloPulse",
  webDir: "public",
  server: {
    url: LIVE_URL,
    // Allow cleartext only for optional same-LAN miner probes (iOS ATS still strict)
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#0c0a09",
  },
  ios: {
    backgroundColor: "#0c0a09",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "SoloPulse",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0c0a09",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0c0a09",
    },
  },
};

export default config;
