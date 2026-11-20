import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { upsertRating, deleteRating } from '@/lib/db';
import { MAX_COMMENT_LENGTH } from '@/lib/films';

function parseYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: Submit or update rating
export async function POST(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { act, rating, comment } = body;
    const year = parseYear(body.festivalYear);

    // Validation
    if (!act || typeof act !== 'string') {
      return NextResponse.json(
        { error: 'Movie title (act) is required' },
        { status: 400 }
      );
    }

    if (!year) {
      return NextResponse.json(
        { error: 'Festival year (festivalYear) is required' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return NextResponse.json(
        { error: 'Rating must be a whole number between 1 and 10' },
        { status: 400 }
      );
    }

    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string') {
        return NextResponse.json(
          { error: 'Comment must be a string' },
          { status: 400 }
        );
      }
      if (comment.length > MAX_COMMENT_LENGTH) {
        return NextResponse.json(
          { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` },
          { status: 400 }
        );
      }
    }

    // Saved for the film the title belongs to, so another screening of it shares the rating
    const savedRating = await upsertRating(
      viewer.visibleEmails,
      viewer.email,
      act,
      year,
      rating,
      comment || null
    );

    return NextResponse.json({
      success: true,
      rating: savedRating,
    });
  } catch (error) {
    console.error('Error saving rating:', error);
    return NextResponse.json(
      { error: 'Failed to save rating', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a rating
export async function DELETE(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { act } = body;
    const year = parseYear(body.festivalYear);

    if (!act || typeof act !== 'string' || !year) {
      return NextResponse.json(
        { error: 'Movie title (act) and festival year (festivalYear) are required' },
        { status: 400 }
      );
    }

    await deleteRating(viewer.visibleEmails, viewer.email, act, year);

    return NextResponse.json({
      success: true,
      message: 'Rating deleted',
    });
  } catch (error) {
    console.error('Error deleting rating:', error);
    return NextResponse.json(
      { error: 'Failed to delete rating', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

