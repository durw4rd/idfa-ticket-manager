import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AuthButton from "@/components/AuthButton";
import IDFALogo from "@/components/IDFALogo";
import { Film } from 'lucide-react';

export const metadata: Metadata = {
  title: "IDFA Ticket Manager",
  description: "Manage your IDFA film festival tickets",
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
    title: 'IDFA Ticket Manager',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-idfa-black">
        <Providers>
          <header className="border-b border-idfa-gray-200 bg-white relative z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <IDFALogo />
                <AuthButton />
              </div>
            </div>
          </header>
          <main className="min-h-screen">
            {children}
          </main>
          <footer className="border-t border-idfa-gray-200 bg-white mt-auto relative z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                <Film className="h-4 w-4 text-idfa-gray-500" />
                <p className="text-idfa-gray-600 text-sm">
                  International Documentary Film Festival Manager
                </p>
                <p className="text-idfa-gray-600 text-sm">
                  Amsterdam | 2025
                </p>
                <span className="hidden sm:inline text-idfa-gray-300">·</span>
                <a
                  href="https://festival.idfa.nl/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-idfa-gray-600 hover:text-idfa-black text-sm transition-colors"
                >
                  Visit IDFA Website
                </a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

