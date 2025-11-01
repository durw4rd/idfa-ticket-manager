import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getRating, upsertRating, getAverageRating, deleteRating } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Get current user's rating for a specific movie, or aggregate stats
export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const act = searchParams.get('act');
  const aggregate = searchParams.get('aggregate') === 'true';

  if (!act) {
    return NextResponse.json(
      { error: 'Movie title (act) parameter is required' },
      { status: 400 }
    );
  }

  try {
    if (aggregate) {
      // Return aggregate stats for the movie
      const stats = await getAverageRating(act);
      return NextResponse.json({
        average: stats?.average || null,
        count: stats?.count || 0,
      });
    } else {
      // Return current user's rating
      const rating = await getRating(session.user.email!, act);
      return NextResponse.json({
        rating: rating || null,
      });
    }
  } catch (error) {
    console.error('Error fetching rating:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rating', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST: Submit or update rating
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { act, rating, comment } = body;

    // Validation
    if (!act || typeof act !== 'string') {
      return NextResponse.json(
        { error: 'Movie title (act) is required' },
        { status: 400 }
      );
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 10) {
      return NextResponse.json(
        { error: 'Rating must be a number between 1 and 10' },
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
      if (comment.length > 500) {
        return NextResponse.json(
          { error: 'Comment must be 500 characters or less' },
          { status: 400 }
        );
      }
    }

    const userEmail = session.user.email!;
    const savedRating = await upsertRating(
      userEmail,
      act,
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
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { act } = body;

    if (!act || typeof act !== 'string') {
      return NextResponse.json(
        { error: 'Movie title (act) is required' },
        { status: 400 }
      );
    }

    const userEmail = session.user.email!;
    await deleteRating(userEmail, act);

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

