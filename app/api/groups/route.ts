import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import {
  acceptInvite,
  createGroup,
  getGroupsForUser,
  inviteMember,
  leaveGroup,
  removeMember,
} from '@/lib/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GroupAction =
  | { action: 'create'; name: string }
  | { action: 'invite'; groupId: string; email: string }
  | { action: 'accept'; groupId: string }
  | { action: 'leave'; groupId: string }
  | { action: 'remove'; groupId: string; email: string };

// GET: The current user's groups and pending invites
export async function GET() {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    return NextResponse.json({ groups: await getGroupsForUser(viewer.email) });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

// POST: Create a group, invite or remove a member, accept an invite, or leave a group
export async function POST(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body: GroupAction = await request.json();

    if (body.action !== 'create' && !UUID_PATTERN.test(String(body.groupId ?? ''))) {
      return NextResponse.json({ error: 'A valid groupId is required' }, { status: 400 });
    }

    switch (body.action) {
      case 'create': {
        const name = body.name?.trim();
        if (!name || name.length > 100) {
          return NextResponse.json({ error: 'Group name is required (max 100 characters)' }, { status: 400 });
        }
        await createGroup(viewer.email, name);
        break;
      }
      case 'invite': {
        if (!body.email || !EMAIL_PATTERN.test(body.email.trim())) {
          return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
        }
        if (!(await inviteMember(viewer.email, body.groupId, body.email))) {
          return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 });
        }
        break;
      }
      case 'accept': {
        if (!(await acceptInvite(viewer.email, body.groupId))) {
          return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
        }
        break;
      }
      case 'leave': {
        await leaveGroup(viewer.email, body.groupId);
        break;
      }
      case 'remove': {
        if (!(await removeMember(viewer.email, body.groupId, body.email))) {
          return NextResponse.json({ error: 'Only group owners can remove members' }, { status: 403 });
        }
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ groups: await getGroupsForUser(viewer.email) });
  } catch (error) {
    console.error('Error updating groups:', error);
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}
