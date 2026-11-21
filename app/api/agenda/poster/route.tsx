import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/auth-helpers';
import { getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getCurrentFestivalYear, formatDate, formatTime, getNow } from '@/lib/dates';
import {
  filterByPerson,
  groupByDay,
  holdersOf,
  makeCrewLookup,
  toAgendaScreening,
  upcomingOnly,
  withAvailability,
} from '@/lib/agenda';
import { getAvailabilityForScreenings } from '@/lib/idfa';
import { userContext } from '@/lib/launchdarkly';
import { getPosterFonts } from '@/lib/poster-fonts';
import {
  CREW_HEX,
  DANGER,
  INK,
  MUTED,
  ONE_LINE,
  PAPER,
  POSTER_FOOTER_HEIGHT as FOOTER_HEIGHT,
  POSTER_PAD as PAD,
  POSTER_WIDTH as WIDTH,
  RULE,
  SPARK,
  plainIcon,
  plural,
} from '@/lib/poster-style';
import { BADGE_ICONS } from '@/components/ui/Avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The canvas height is the sum of these fixed blocks, so every block has an explicit height and
// clamps its text: nothing can wrap past its budget and get cut off at the bottom of the image.
const MASTHEAD_HEIGHT = 360;
const DAY_HEADING_HEIGHT = 84; // 28px gap above + 56px heading
const ROW_PADDING = 44;
const TITLE_LINE = 48;
const VENUE_LINE = 40;
const EMPTY_HEIGHT = 160; // "Nothing coming up", when the upcoming filter leaves nothing
// About this many title characters surely fit on one line next to the time and avatars. A title
// that's estimated at two lines but fits in one leaves the spare space under its row.
const TITLE_CHARS_PER_LINE = 28;

function titleLines(title: string): 1 | 2 {
  return title.length > TITLE_CHARS_PER_LINE ? 2 : 1;
}

function rowHeight(title: string): number {
  return ROW_PADDING + titleLines(title) * TITLE_LINE + VENUE_LINE + 1;
}

/**
 * GET /api/agenda/poster?year=2026&who=all|<crew index>&when=all|upcoming
 * The festival as one tall PNG, made to be shared. `who` is an index into the viewer's crew
 * (as returned by getCrew), so no email ends up in a URL. `when=upcoming` leaves out screenings that
 * have started, for inviting friends to the rest.
 */
export async function GET(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const year = Number(params.get('year')) || getCurrentFestivalYear();
  const whoParam = params.get('who') || 'all';
  const upcoming = params.get('when') === 'upcoming';
  const now = getNow();

  const [{ screenings, availability }, crew, fonts] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year).then(async (screenings) => ({
      screenings,
      availability: await getAvailabilityForScreenings(screenings, now, userContext(viewer.email)),
    })),
    getCrew(viewer),
    getPosterFonts(),
  ]);

  const person = whoParam === 'all' ? null : crew[Number(whoParam)];
  if (whoParam !== 'all' && !person) {
    return NextResponse.json({ error: 'Unknown person' }, { status: 400 });
  }

  const lookup = makeCrewLookup(crew);
  const everything = filterByPerson(
    withAvailability(screenings.map(toAgendaScreening), availability),
    person ? person.email : 'all'
  );
  const agenda = upcoming ? upcomingOnly(everything, now) : everything;
  const soldOut = agenda.filter((screening) => screening.availability === 'sold-out').length;
  const days = groupByDay(agenda);
  const subtitle = person ? person.name : crew.map((member) => member.name).join(' · ');
  const display = fonts.length > 0 ? 'Archivo Display' : undefined;
  const body = fonts.length > 0 ? 'Archivo' : undefined;

  const height =
    PAD * 2 +
    MASTHEAD_HEIGHT +
    days.length * DAY_HEADING_HEIGHT +
    agenda.reduce((sum, screening) => sum + rowHeight(screening.act), 0) +
    (agenda.length === 0 ? EMPTY_HEIGHT : 0) +
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
              {upcoming ? 'Coming up' : 'My festival'}
            </div>
          </div>
          <div style={{ fontFamily: display, fontSize: 150, lineHeight: 1, marginTop: 24, letterSpacing: -4 }}>
            {`IDFA ${year}`}
          </div>
          <div style={{ ...ONE_LINE, fontSize: 44, lineHeight: '56px', marginTop: 16, color: SPARK }}>{subtitle}</div>
          <div style={{ display: 'flex', fontSize: 30, marginTop: 8, color: MUTED }}>
            {`${plural(agenda.length, upcoming ? 'upcoming screening' : 'screening')} · ${plural(days.length, 'day')}`}
            {soldOut > 0 && <span style={{ color: DANGER, marginLeft: 12 }}>{`· ${soldOut} sold out`}</span>}
          </div>
        </div>

        {agenda.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: EMPTY_HEIGHT,
              fontFamily: display,
              fontSize: 44,
              color: MUTED,
              borderTop: `2px solid ${SPARK}`,
            }}
          >
            Nothing coming up
          </div>
        )}

        {days.map((day) => (
          <div key={day.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: DAY_HEADING_HEIGHT,
                fontSize: 28,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: SPARK,
                paddingBottom: 14,
                borderBottom: `2px solid ${SPARK}`,
              }}
            >
              {formatDate(day.date)}
            </div>
            {day.screenings.map((screening) => {
              const start = new Date(screening.startsAt);
              return (
                <div
                  key={screening.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    height: rowHeight(screening.act),
                    overflow: 'hidden',
                    paddingTop: ROW_PADDING / 2,
                    paddingBottom: ROW_PADDING / 2,
                    borderBottom: `1px solid ${RULE}`,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', width: 150 }}>
                    <div style={{ fontSize: 40, fontFamily: display }}>{formatTime(start)}</div>
                    {screening.endsAt && (
                      <div style={{ fontSize: 24, color: MUTED }}>{`–${formatTime(new Date(screening.endsAt))}`}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'block',
                        fontFamily: display,
                        fontSize: 44,
                        lineHeight: `${TITLE_LINE}px`,
                        maxHeight: titleLines(screening.act) * TITLE_LINE,
                        overflow: 'hidden',
                        lineClamp: titleLines(screening.act),
                      }}
                    >
                      {screening.act}
                    </div>
                    <div style={{ display: 'flex', fontSize: 28, lineHeight: `${VENUE_LINE}px`, color: MUTED }}>
                      <div style={{ ...ONE_LINE, flexShrink: 1, minWidth: 0 }}>{screening.location}</div>
                      {screening.hasQa && (
                        <div style={{ flexShrink: 0, marginLeft: 16, letterSpacing: 2 }}>Q&A</div>
                      )}
                      {/* Tells friends which screenings they can't join any more */}
                      {screening.availability && (
                        <div
                          style={{
                            flexShrink: 0,
                            marginLeft: 16,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            color: screening.availability === 'sold-out' ? DANGER : PAPER,
                          }}
                        >
                          {screening.availability === 'sold-out' ? 'Sold out' : 'Few left'}
                        </div>
                      )}
                    </div>
                  </div>
                  {!person && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 24, paddingTop: 10 }}>
                      {holdersOf(screening).map((email) => {
                        const member = lookup(email);
                        const hex = CREW_HEX[member.color % CREW_HEX.length];
                        const Icon = member.badge ? BADGE_ICONS[member.badge] : null;
                        return (
                          <div
                            key={email}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 40,
                              height: 40,
                              borderRadius: 40,
                              // The tint the app's Avatar uses, mixed onto the ink background
                              background: `${hex}33`,
                              color: hex,
                              fontSize: 22,
                              fontFamily: display,
                            }}
                          >
                            {Icon
                              ? plainIcon(Icon, { size: 24, color: hex, strokeWidth: 2.25 })
                              : member.name.charAt(0).toUpperCase()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
