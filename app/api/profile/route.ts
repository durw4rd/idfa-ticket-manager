import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { setProfileBadge, setProfileName } from '@/lib/groups';
import { isBadge } from '@/lib/display';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME_LENGTH = 40;

// PATCH: Set your display name and/or badge; send only the field you're changing. An empty name
// resets it to the default derived from your email; a null badge goes back to your initial.
export async function PATCH(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();

    if (body && 'badge' in body) {
      if (body.badge !== null && !isBadge(body.badge)) {
        return NextResponse.json({ error: 'Unknown badge' }, { status: 400 });
      }
      if (!(await setProfileBadge(viewer, body.badge))) {
        return NextResponse.json({ error: 'Someone in your crew already has that badge' }, { status: 409 });
      }
    }

    if (body && 'name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
      }
      await setProfileName(viewer.email, name);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
