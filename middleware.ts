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
    // Protect all pages except public ones
    // Exclude: /api/*, /login, static files, and Next.js internals.
    // API routes check the session themselves (requireAuth) and answer 401 JSON, which client code
    // can act on; a redirect to the login page would hand fetch() an HTML page instead.
    // /api/inbound/* is the mail webhook: no session, it checks its own secret (see the route).
    '/((?!api/|login|_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};

