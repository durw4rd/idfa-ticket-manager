import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Email whitelist
const ALLOWED_EMAILS = [
  'misa.fasa@gmail.com',
  'martina.chylkova@gmail.com',
];

// Auto-detect NEXTAUTH_URL if not explicitly set
// Priority: explicit env var > Vercel's VERCEL_URL > hardcoded production URL > localhost
if (!process.env.NEXTAUTH_URL) {
  // Vercel automatically sets VERCEL_URL for deployments (e.g., "idfa-ticket-manager.vercel.app")
  if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
  } else if (process.env.NODE_ENV === 'production') {
    process.env.NEXTAUTH_URL = 'https://idfa-ticket-manager.vercel.app';
  } else {
    // Default to localhost for local development
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      // Check if user email is in whitelist
      if (user.email && ALLOWED_EMAILS.includes(user.email)) {
        return true;
      }
      // Block sign in if email not in whitelist
      return false;
    },
    async session({ session, token }) {
      // Add user ID to session
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.AUTH_SECRET,
};

