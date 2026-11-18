import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { UUID_PATTERN } from '@/lib/films';
import { setVoteLinkVoted } from '@/lib/vote-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST marks a voting link used (opened from the app, or "Already voted"); DELETE undoes that.
// Only whoever is shown the link may. The link's URL is never read or logged here.
async function setVoted(params: Promise<{ id: string }>, voted: boolean) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Voting link not found' }, { status: 404 });
  }
  try {
    if (!(await setVoteLinkVoted(viewer, id, voted))) {
      return NextResponse.json({ error: 'Voting link not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating voting link:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not save your vote' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setVoted(params, true);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setVoted(params, false);
}
