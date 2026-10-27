import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { evaluateBooleanFlag, userContext } from './launchdarkly';
import { isKnownMember, normalizeEmail } from './groups';

// LaunchDarkly flag that controls who may sign in (target the `allowed-users` segment)
const APP_ACCESS_FLAG_KEY = 'app-access';

// Comma-separated fallback allowlist, used only when LaunchDarkly can't be reached
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => normalizeEmail(email))
  .filter(Boolean);

async function canSignIn(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);

  // Anyone invited to (or already in) a group can sign in
  try {
    if (await isKnownMember(email)) {
      return true;
    }
  } catch (error) {
    console.error('Failed to check group membership during sign-in:', error);
  }

  const access = await evaluateBooleanFlag(APP_ACCESS_FLAG_KEY, userContext(email), false);
  if (access.available) {
    return access.value;
  }

  return ALLOWED_EMAILS.includes(email);
}

// NextAuth needs the site's public URL for OAuth callbacks and sign-out redirects. On Vercel,
// with NEXTAUTH_URL unset, it takes it from each request's host, so sign-in stays on whatever
// domain the user is on. Don't derive it from VERCEL_URL: that's the per-deployment hostname,
// which Google doesn't know (redirect_uri_mismatch) and which sits behind Vercel's login wall.
if (!process.env.NEXTAUTH_URL && !process.env.VERCEL) {
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
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
    async signIn({ user }) {
      // Block sign in unless the user is invited, or allowed by LaunchDarkly (or the fallback allowlist)
      return !!user.email && (await canSignIn(user.email));
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

