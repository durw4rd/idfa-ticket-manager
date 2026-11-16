import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    // Protect all routes except public ones
    // Exclude: /api/auth/*, /login, static files, and Next.js internals.
    // /api/inbound/* is the mail webhook: no session, it checks its own secret (see the route).
    '/((?!api/auth|api/inbound|login|_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};

