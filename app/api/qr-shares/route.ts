import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { setQrShare } from '@/lib/qr-shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT: Start or stop letting a crew-mate see your tickets' QR codes.
// Body: { viewerEmail: string, shared: boolean }
export async function PUT(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    if (!body || typeof body.viewerEmail !== 'string' || typeof body.shared !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!(await setQrShare(viewer, body.viewerEmail, body.shared))) {
      return NextResponse.json({ error: 'You can only share with someone in your crew' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating QR sharing:', error);
    return NextResponse.json({ error: 'Could not update sharing' }, { status: 500 });
  }
}
