import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/auth-helpers';
import { getFilmPlacesForYear, getRatingsForYear, getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getCurrentFestivalYear } from '@/lib/dates';
import { toAgendaScreening } from '@/lib/agenda';
import { getFilmOverview } from '@/lib/idfa';
import { countryName } from '@/lib/countries';
import { buildReview, reviewPins, synopsisLine, type ReviewEntry } from '@/lib/review';
import { fitViewBox, project } from '@/lib/world-map';
import { COUNTRY_SHAPES } from '@/lib/world-map-paths';
import { getPosterFonts } from '@/lib/poster-fonts';
import {
  INK,
  MUTED,
  ONE_LINE,
  PAPER,
  POSTER_FOOTER_HEIGHT as FOOTER_HEIGHT,
  POSTER_PAD as PAD,
  POSTER_WIDTH as WIDTH,
  RULE,
  SPARK,
  plural,
} from '@/lib/poster-style';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INNER = WIDTH - PAD * 2;
// As in the agenda poster, the canvas height is the sum of fixed blocks that clamp their text
const MASTHEAD_HEIGHT = 330;
const MAP_HEIGHT_PX = 540;
const MAP_GAP = 56; // Below the map
const LIST_HEADING_HEIGHT = 70;
const ROW_PADDING = 44;
const TITLE_LINE = 50;
const PLACE_LINE = 40;
const SYNOPSIS_LINE = 38;
const PIN_SIZE = 44;
// About this many characters surely fit on a line (title next to the rank and score; synopsis below it)
const TITLE_CHARS_PER_LINE = 28;
const SYNOPSIS_CHARS_PER_LINE = 54;
// Two lines' worth, so the line ends at a word with its own ellipsis rather than the clamp's
const SYNOPSIS_MAX_CHARS = 110;
// The whole export waits at most this long for IDFA synopses (cached for a day after the first time)
const SYNOPSIS_DEADLINE_MS = 4000;

const MAP_SEA = '#1A1A18';
const MAP_LAND = '#2C2C29';
const MAP_LAND_SEEN = '#4A4943'; // Countries with a film on the list

interface Row extends ReviewEntry {
  synopsis: string | null;
}

const titleLines = (row: Row) => (row.title.length > TITLE_CHARS_PER_LINE ? 2 : 1);
const synopsisLines = (row: Row) => (!row.synopsis ? 0 : row.synopsis.length > SYNOPSIS_CHARS_PER_LINE ? 2 : 1);

function rowHeight(row: Row): number {
  return ROW_PADDING + titleLines(row) * TITLE_LINE + (row.place ? PLACE_LINE : 0) + synopsisLines(row) * SYNOPSIS_LINE + 1;
}

function placeLabel(place: NonNullable<ReviewEntry['place']>): string {
  const country = countryName(place.country);
  return place.name ? `${place.name}, ${country}` : country;
}

/** One line of IDFA's synopsis per film, for the films that finish before the shared deadline */
async function synopses(entries: ReviewEntry[]): Promise<Array<string | null>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SYNOPSIS_DEADLINE_MS);
  });
  try {
    return await Promise.all(
      entries.map((entry) =>
        entry.festivalLink
          ? Promise.race([getFilmOverview(entry.festivalLink, entry.title).then((text) => synopsisLine(text, SYNOPSIS_MAX_CHARS)), deadline])
          : null
      )
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/films/review?year=2026
 * Your festival review as one tall PNG, made to be shared: the films you rated, best first, each
 * with where it takes place and a line from IDFA's synopsis, and a map of those places.
 */
export async function GET(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const year = Number(request.nextUrl.searchParams.get('year')) || getCurrentFestivalYear();
  // festival_year is an INT: ?year=1e20 would fail in the database
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Unknown year' }, { status: 400 });
  }

  const [{ ratings, keysByTitle }, screenings, { places }, crew, fonts] = await Promise.all([
    getRatingsForYear(viewer.visibleEmails, year),
    getScreeningsForYear(viewer.visibleEmails, year),
    getFilmPlacesForYear(viewer.visibleEmails, year),
    getCrew(viewer),
    getPosterFonts(),
  ]);
  const review = buildReview({
    ratings,
    screenings: screenings.map(toAgendaScreening),
    keysByTitle,
    places,
    me: viewer.email,
  });
  if (review.entries.length === 0) {
    return NextResponse.json({ error: 'Nothing rated yet' }, { status: 404 });
  }

  const lines = await synopses(review.entries);
  const rows: Row[] = review.entries.map((entry, index) => ({ ...entry, synopsis: lines[index] }));
  const me = crew.find((member) => member.isMe);
  const display = fonts.length > 0 ? 'Archivo Display' : undefined;
  const body = fonts.length > 0 ? 'Archivo' : undefined;

  const placed = rows.filter((row) => row.place);
  const view = fitViewBox(
    placed.map((row) => project(row.place!.lon, row.place!.lat)),
    INNER / MAP_HEIGHT_PX
  );
  const pins = reviewPins(rows, view, INNER);
  const seenCountries = new Set(placed.map((row) => row.place!.country));
  // About 1.5px on the poster, however far the map is zoomed in
  const outline = (1.5 * view.w) / INNER;

  const stats = [
    plural(rows.length, 'film'),
    review.average !== null ? `avg ${review.average.toFixed(1)}` : null,
    review.countries > 0 ? plural(review.countries, 'country', 'countries') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const height =
    PAD * 2 +
    MASTHEAD_HEIGHT +
    (placed.length > 0 ? MAP_HEIGHT_PX + MAP_GAP : 0) +
    LIST_HEADING_HEIGHT +
    rows.reduce((sum, row) => sum + rowHeight(row), 0) +
    FOOTER_HEIGHT;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: INK,
          color: PAPER,
          padding: PAD,
          fontFamily: body,
        }}
      >
        {/* Masthead */}
        <div style={{ display: 'flex', flexDirection: 'column', height: MASTHEAD_HEIGHT, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 28, background: SPARK }} />
            <div style={{ fontSize: 30, letterSpacing: 4, color: MUTED, textTransform: 'uppercase' }}>
              My festival review
            </div>
          </div>
          <div style={{ fontFamily: display, fontSize: 150, lineHeight: 1, marginTop: 24, letterSpacing: -4 }}>
            {`IDFA ${year}`}
          </div>
          {me && <div style={{ ...ONE_LINE, fontSize: 44, lineHeight: '56px', marginTop: 16, color: SPARK }}>{me.name}</div>}
          <div style={{ display: 'flex', fontSize: 30, marginTop: 8, color: MUTED }}>{stats}</div>
        </div>

        {/* Where the films take place, numbered like the list */}
        {placed.length > 0 && (
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: INNER,
              height: MAP_HEIGHT_PX,
              marginBottom: MAP_GAP,
              borderRadius: 24,
              overflow: 'hidden',
              background: MAP_SEA,
            }}
          >
            <svg
              width={INNER}
              height={MAP_HEIGHT_PX}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              style={{ position: 'absolute', left: 0, top: 0 }}
            >
              {COUNTRY_SHAPES.map((shape) => (
                <path
                  key={shape.code}
                  d={shape.d}
                  fill={seenCountries.has(shape.code) ? MAP_LAND_SEEN : MAP_LAND}
                  stroke={MAP_SEA}
                  strokeWidth={outline}
                />
              ))}
            </svg>
            {/* Divs, not SVG text: next/og draws an inline SVG without the poster's fonts */}
            {pins.map((pin) => {
              const label = pin.ranks.length > 3 ? `${pin.ranks.slice(0, 2).join('·')} +${pin.ranks.length - 2}` : pin.ranks.join('·');
              const width = Math.max(PIN_SIZE, 20 + label.length * 15);
              return (
                <div
                  key={pin.ranks[0]}
                  style={{
                    position: 'absolute',
                    left: pin.x - width / 2,
                    top: pin.y - PIN_SIZE / 2,
                    width,
                    height: PIN_SIZE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: PIN_SIZE,
                    background: pin.ranks[0] === 1 ? SPARK : PAPER,
                    color: INK,
                    border: `3px solid ${MAP_SEA}`,
                    fontFamily: display,
                    fontSize: 24,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            height: LIST_HEADING_HEIGHT,
            fontSize: 28,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: SPARK,
            paddingBottom: 14,
            borderBottom: `2px solid ${SPARK}`,
          }}
        >
          Best first
        </div>

        {rows.map((row, index) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              height: rowHeight(row),
              overflow: 'hidden',
              paddingTop: ROW_PADDING / 2,
              paddingBottom: ROW_PADDING / 2,
              borderBottom: `1px solid ${RULE}`,
            }}
          >
            <div style={{ display: 'flex', width: 76, fontFamily: display, fontSize: 36, lineHeight: `${TITLE_LINE}px`, color: MUTED }}>
              {String(index + 1)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'block',
                  fontFamily: display,
                  fontSize: 44,
                  lineHeight: `${TITLE_LINE}px`,
                  maxHeight: titleLines(row) * TITLE_LINE,
                  overflow: 'hidden',
                  lineClamp: titleLines(row),
                }}
              >
                {row.title}
              </div>
              {row.place && (
                <div style={{ ...ONE_LINE, fontSize: 28, lineHeight: `${PLACE_LINE}px`, color: MUTED }}>
                  {placeLabel(row.place)}
                </div>
              )}
              {row.synopsis && (
                <div
                  style={{
                    display: 'block',
                    fontSize: 27,
                    lineHeight: `${SYNOPSIS_LINE}px`,
                    maxHeight: synopsisLines(row) * SYNOPSIS_LINE,
                    overflow: 'hidden',
                    lineClamp: synopsisLines(row),
                    color: '#C9C8C1',
                  }}
                >
                  {row.synopsis}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', marginLeft: 24, flexShrink: 0 }}>
              <div style={{ fontFamily: display, fontSize: 64, lineHeight: `${TITLE_LINE + 6}px` }}>{String(row.rating)}</div>
              <div style={{ fontSize: 26, color: MUTED, marginLeft: 4 }}>/10</div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'flex-end', height: FOOTER_HEIGHT, fontSize: 24, color: MUTED }}>
          International Documentary Film Festival Amsterdam
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      // Passing [] would replace next/og's built-in font rather than fall back to it
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}
