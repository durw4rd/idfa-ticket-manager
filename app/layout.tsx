import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import AppNav from "@/components/AppNav";

// Variable weight and width: UI text at normal width, film titles semi-condensed (.font-display)
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IDFA Ticket Manager",
  description: "Your IDFA agenda, tickets and ratings, shared with your crew",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IDFA',
  },
};

// viewport-fit=cover makes env(safe-area-inset-*) work, so the tab bar clears the iPhone home indicator
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0E0D' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>
          <main className="mx-auto max-w-xl px-4 pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom)+2rem)]">
            {children}
          </main>
          <AppNav />
        </Providers>
      </body>
    </html>
  );
}
