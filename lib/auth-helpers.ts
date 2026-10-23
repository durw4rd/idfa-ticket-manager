import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
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

/**
 * Get the signed-in user and the emails whose data they can see.
 * Returns null if not authenticated.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return null;
  }
  return { email: normalizeEmail(email), visibleEmails: await getVisibleEmails(email) };
}

/**
 * Require authentication for API routes
 * Returns the viewer if authenticated, or a 401 response if not
 */
export async function requireAuth() {
  const viewer = await getViewer();

  if (!viewer) {
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
