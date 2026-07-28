import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "SoloPulse — Solo Mining Radar",
  description:
    "Real-time solo mining dashboard. Live hashrate, best shares, and block discovery odds. CKPool · Public Pool · NerdQAxe.",
  applicationName: "SoloPulse",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SoloPulse",
  },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "SoloPulse",
    description: "Real-time solo mining pulse & block odds",
    type: "website",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "SoloPulse",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('solopulse:theme');
                if (t === 'light' || t === 'dark') {
                  document.documentElement.dataset.theme = t;
                  document.documentElement.classList.add(t);
                } else {
                  document.documentElement.dataset.theme = 'dark';
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
              if ('serviceWorker' in navigator) {
                var regSw = function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
                };
                if (document.readyState === 'complete') regSw();
                else window.addEventListener('load', regSw);
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
