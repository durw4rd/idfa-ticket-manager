import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AuthButton from "@/components/AuthButton";
import Link from "next/link";

export const metadata: Metadata = {
  title: "IDFA Ticket Manager",
  description: "Manage your IDFA film festival tickets",
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
          <header className="border-b border-idfa-gray-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                  <h1 className="text-2xl font-bold tracking-tight">IDFA</h1>
                  <span className="text-idfa-gray-600 text-sm">Ticket Manager</span>
                </Link>
                <AuthButton />
              </div>
            </div>
          </header>
          <main className="min-h-screen">
            {children}
          </main>
          <footer className="border-t border-idfa-gray-200 bg-white mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <p className="text-center text-idfa-gray-600 text-sm">
              International Documentary Film Festival Amsterdam
            </p>
          </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

