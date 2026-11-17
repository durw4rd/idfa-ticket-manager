import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, hasAccessEnded } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ends the session of a user whose access was taken away (see hasAccessEnded in lib/auth.ts).
 * Pages redirect here because a server page can't delete cookies. No requireAuth: it would answer
 * 401 for exactly the users this is for. It only signs out someone whose access has really ended,
 * so a link to it can't sign anyone else out.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!(await hasAccessEnded(email))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.redirect(new URL('/login?error=AccessEnded', request.url));
  // The session token, including the chunks NextAuth splits a large one into
  for (const cookie of request.cookies.getAll()) {
    if (/^(__Secure-)?next-auth\.session-token(\.\d+)?$/.test(cookie.name)) {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        sameSite: 'lax',
        secure: cookie.name.startsWith('__Secure-'),
      });
    }
  }
  // And what this browser kept: offline tickets (public/sw.js) and saved preferences
  response.headers.set('Clear-Site-Data', '"cache", "storage"');
  return response;
}
