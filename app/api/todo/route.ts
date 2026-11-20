import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow } from '@/lib/dates';
import { getTodo } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?year=2025: how many films are waiting for your rating or vote that festival (this one when
// no year is given), for the Films tab's count. The tab opens the year picked on Agenda or Films,
// so its count follows it. Only the number: no titles, and never a voting link.
export async function GET(request: Request) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const param = new URL(request.url).searchParams.get('year');
  const year = param === null ? getCurrentFestivalYear() : Number(param);
  // Checked before any query: festival_year is an INT, so ?year=1e20 would fail in the database
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid festival year' }, { status: 400 });
  }

  try {
    const todo = await getTodo(viewer, year, getNow());
    return NextResponse.json({ count: todo.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('Error counting the to-do list:', err);
    return NextResponse.json({ error: 'Could not count the to-do list' }, { status: 500 });
  }
}
