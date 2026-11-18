import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentFestivalYear, getNow } from '@/lib/dates';
import { getTodo } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: how many films are waiting for your rating or vote this festival, for the Films tab's
// count. Only the number: no titles, and never a voting link.
export async function GET() {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const todo = await getTodo(viewer, getCurrentFestivalYear(), getNow());
    return NextResponse.json({ count: todo.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('Error counting the to-do list:', err);
    return NextResponse.json({ error: 'Could not count the to-do list' }, { status: 500 });
  }
}
