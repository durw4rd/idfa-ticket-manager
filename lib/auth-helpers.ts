import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions, hasAccessEnded } from './auth';
import { NextResponse } from 'next/server';
import { getVisibleEmails, normalizeEmail } from './groups';

/**
 * Get the current session for use in API routes
 * Returns null if not authenticated
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

export interface Viewer {
  email: string;
  visibleEmails: string[]; // The viewer plus their active group members
}

/** Where a page sends a user whose access has ended: it deletes their session cookie */
export const ACCESS_ENDED_PATH = '/api/access-ended';

/** The signed-in user, 'ended' if their access has been taken away since they signed in, or null */
async function loadViewer(): Promise<Viewer | 'ended' | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return null;
  }
  if (await hasAccessEnded(email)) {
    return 'ended';
  }
  return { email: normalizeEmail(email), visibleEmails: await getVisibleEmails(email) };
}

/**
 * Get the signed-in user and the emails whose data they can see, for server pages.
 * Returns null if not authenticated. A user whose access has ended is sent to sign in again,
 * through ACCESS_ENDED_PATH so their session cookie goes.
 */
export async function getViewer(): Promise<Viewer | null> {
  const viewer = await loadViewer();
  if (viewer === 'ended') {
    redirect(ACCESS_ENDED_PATH);
  }
  return viewer;
}

/**
 * Require authentication for API routes
 * Returns the viewer if authenticated, or a 401 response if not (or no longer allowed in)
 */
export async function requireAuth() {
  const viewer = await loadViewer();

  if (!viewer || viewer === 'ended') {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
      viewer: null,
    };
  }

  return { viewer, error: null };
}
