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

// How long a "still allowed" answer is trusted, per server instance. Removing someone (from every
// group and from app-access) signs them out within about this long. Only "allowed" is remembered:
// someone re-invited a moment after losing access must be able to use the session they sign in with.
const ACCESS_RECHECK_MS = 60_000;
const allowedAt = new Map<string, number>();
// Which check last found each user had lost access, so an "allowed" answer from a check that
// started before it (and finished later) can't be remembered over it. Checks are numbered in the
// order they start.
let checkCount = 0;
const endedBy = new Map<string, number>();

/**
 * Whether a signed-in user has since lost access: no longer in any group (invited or active), and
 * not allowed by the app-access flag (or the fallback allowlist when LaunchDarkly is down). Sessions
 * are 30-day JWTs, so the sign-in check alone would let a removed user keep using the app until it
 * expires; getViewer and requireAuth ask this on every request instead (a "still allowed" answer is reused for a minute).
 *
 * Only a definite answer ends a session: if the database or LaunchDarkly can't be asked, the user
 * keeps access (a blip shouldn't sign the crew out at the cinema door). `fresh` skips the
 * remembered answer.
 */
export async function hasAccessEnded(rawEmail: string, { fresh = false } = {}): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const checkedAt = allowedAt.get(email);
  if (!fresh && checkedAt !== undefined && Date.now() - checkedAt < ACCESS_RECHECK_MS) {
    return false;
  }

  const check = ++checkCount;
  let ended: boolean;
  try {
    ended = !(await isKnownMember(email)) && !(await isAllowedWithoutGroups(email));
  } catch (error) {
    console.error('Failed to re-check access:', error);
    return false;
  }
  if (ended) {
    endedBy.set(email, check);
    allowedAt.delete(email);
  } else if ((endedBy.get(email) ?? 0) < check) {
    allowedAt.set(email, Date.now());
  }
  return ended;
}

/**
 * Whether the user may keep using the app without being in (or invited to) any group: the
 * app-access flag lets them in, or, with LaunchDarkly down, the fallback allowlist does (or there
 * is none). Used by hasAccessEnded, and to warn someone that declining their last invite would sign
 * them out.
 */
export async function isAllowedWithoutGroups(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const access = await evaluateBooleanFlag(APP_ACCESS_FLAG_KEY, userContext(email), true);
  // With LaunchDarkly down, the fallback allowlist only decides when there is one
  return access.available ? access.value : ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(email);
}

// NextAuth needs the site's public URL for OAuth callbacks and sign-out redirects. On Vercel,
// with NEXTAUTH_URL unset, it takes it from each request's host, so sign-in stays on whatever
// domain the user is on. Don't derive it from VERCEL_URL: that's the per-deployment hostname,
// which Google doesn't know (redirect_uri_mismatch) and which sits behind Vercel's login wall.
// Checks VERCEL_URL rather than VERCEL: `vercel env pull` writes VERCEL="1" with an empty
// VERCEL_URL into .env.local, and next-auth/react can't parse an empty URL (local builds fail).
if (!process.env.NEXTAUTH_URL && !process.env.VERCEL_URL) {
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
    // A refused sign-in (AccessDenied from the signIn callback) and other auth errors come back to
    // the login page as ?error=, which explains them; NextAuth's own error page would not
    error: '/login',
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

