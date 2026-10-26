import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/auth-helpers';
import { getScreeningsForYear } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getCurrentFestivalYear, formatDate, formatTime } from '@/lib/dates';
import { filterByPerson, groupByDay, holdersOf, makeCrewLookup, toAgendaScreening } from '@/lib/agenda';
import { getPosterFonts } from '@/lib/poster-fonts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const PAD = 72;
const INK = '#111111';
const PAPER = '#FAFAF7';
const MUTED = '#9C9B94';
const SPARK = '#FFD600';
// Crew colours as hex (satori can't read CSS variables); the dark-mode values from app/globals.css
const CREW_HEX = ['#FF7057', '#6A92FF', '#38C496', '#BE80FF', '#FF66AA', '#30C4D8'];

/**
 * GET /api/agenda/poster?year=2026&who=all|<crew index>
 * The whole festival as one tall PNG, made to be shared. `who` is an index into the viewer's crew
 * (as returned by getCrew), so no email ends up in a URL.
 */
export async function GET(request: NextRequest) {
  const { viewer, error } = await requireAuth();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const year = Number(params.get('year')) || getCurrentFestivalYear();
  const whoParam = params.get('who') || 'all';

  const [screenings, crew, fonts] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getCrew(viewer),
    getPosterFonts(),
  ]);

  const person = whoParam === 'all' ? null : crew[Number(whoParam)];
  if (whoParam !== 'all' && !person) {
    return NextResponse.json({ error: 'Unknown person' }, { status: 400 });
  }

  const lookup = makeCrewLookup(crew);
  const agenda = filterByPerson(screenings.map(toAgendaScreening), person ? person.email : 'all');
  const days = groupByDay(agenda);
  const subtitle = person ? person.name : crew.map((member) => member.name).join(' · ');
  const display = fonts.length > 0 ? 'Archivo Display' : undefined;
  const body = fonts.length > 0 ? 'Archivo' : undefined;

  const height = 420 + days.length * 92 + agenda.length * 118 + 140;

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
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 28, background: SPARK }} />
            <div style={{ fontSize: 30, letterSpacing: 4, color: MUTED, textTransform: 'uppercase' }}>
              My festival
            </div>
          </div>
          <div style={{ fontFamily: display, fontSize: 150, lineHeight: 1, marginTop: 24, letterSpacing: -4 }}>
            {`IDFA ${year}`}
          </div>
          <div style={{ display: 'flex', fontSize: 44, marginTop: 16, color: SPARK }}>{subtitle}</div>
          <div style={{ display: 'flex', fontSize: 30, marginTop: 8, color: MUTED }}>
            {`${agenda.length} ${agenda.length === 1 ? 'screening' : 'screenings'} · ${days.length} ${days.length === 1 ? 'day' : 'days'}`}
          </div>
        </div>

        {days.map((day) => (
          <div key={day.key} style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
            <div
              style={{
                display: 'flex',
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
                    paddingTop: 22,
                    paddingBottom: 22,
                    borderBottom: '1px solid #2A2A27',
                  }}
                >
                  <div style={{ width: 150, fontSize: 40, fontFamily: display }}>{formatTime(start)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontFamily: display, fontSize: 44, lineHeight: 1.1 }}>{screening.act}</div>
                    <div style={{ display: 'flex', fontSize: 28, color: MUTED, marginTop: 6 }}>{screening.location}</div>
                  </div>
                  {!person && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 24, paddingTop: 10 }}>
                      {holdersOf(screening).map((email) => {
                        const member = lookup(email);
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
                              background: CREW_HEX[member.color % CREW_HEX.length],
                              color: INK,
                              fontSize: 22,
                              fontFamily: display,
                            }}
                          >
                            {member.name.charAt(0).toUpperCase()}
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

        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 48, fontSize: 24, color: MUTED }}>
          International Documentary Film Festival Amsterdam
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      fonts,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}
