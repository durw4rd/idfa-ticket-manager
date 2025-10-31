import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { NextResponse } from 'next/server';

/**
 * Get the current session for use in API routes
 * Returns null if not authenticated
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Require authentication for API routes
 * Returns the session if authenticated, or a 401 response if not
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
      session: null,
    };
  }

  return { session, error: null };
}

