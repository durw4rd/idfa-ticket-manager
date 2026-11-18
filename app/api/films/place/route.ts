import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { saveFilmPlace } from '@/lib/db';
import { cleanPlaceName, countryByCode, MAX_PLACE_NAME_LENGTH } from '@/lib/countries';
import { pickCoordinates } from '@/lib/film-place';
import { geocodePlace } from '@/lib/find-film-place';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

/**
 * PUT: set where a film takes place, by hand. Body: { act, festivalYear, country, placeName? },
 * with country null for "no single place" (the film leaves the map). Anyone whose crew has a
 * ticket for the film may set it; the AI's lookup never overwrites it afterwards.
 */
export async function PUT(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const act = typeof body.act === 'string' ? body.act : '';
    const year = parseYear(body.festivalYear);
    if (!act || !year) {
      return NextResponse.json({ error: 'Film title and festival year are required' }, { status: 400 });
    }

    if (body.country === null) {
      const saved = await saveFilmPlace(viewer.visibleEmails, act, year, null, 'none');
      return saved
        ? NextResponse.json({ success: true, place: null })
        : NextResponse.json({ error: 'Film not found' }, { status: 404 });
    }

    const country = typeof body.country === 'string' ? countryByCode(body.country) : null;
    if (!country) {
      return NextResponse.json({ error: 'Pick a country from the list' }, { status: 400 });
    }
    if (body.placeName != null && (typeof body.placeName !== 'string' || body.placeName.length > MAX_PLACE_NAME_LENGTH)) {
      return NextResponse.json({ error: `Place name must be ${MAX_PLACE_NAME_LENGTH} characters or less` }, { status: 400 });
    }
    const placeName = cleanPlaceName(body.placeName);

    // Find the place in that country; the name typed is kept even when the geocoder doesn't know
    // it, with the pin on the country's centre, and the response says so
    const candidates = placeName ? await geocodePlace(placeName, country.code) : [];
    const picked = pickCoordinates({ placeName, country: country.code, estimate: null }, candidates);
    const approximate = !!placeName && picked.placeName === null;
    const place = { placeName, country: country.code, lat: picked.lat, lon: picked.lon };

    const saved = await saveFilmPlace(viewer.visibleEmails, act, year, place, 'manual');
    if (!saved) {
      return NextResponse.json({ error: 'Film not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, place, approximate, countryName: country.name });
  } catch (error) {
    console.error('Error saving film place:', error);
    return NextResponse.json(
      { error: 'Failed to save the place', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
