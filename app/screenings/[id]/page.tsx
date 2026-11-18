import Image from 'next/image';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { ExternalLink, Navigation, Vote } from 'lucide-react';
import { getScreening, getRatingsForFilm, getFilmPlace } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { formatDate, formatTime, formatTimeRange, getNow } from '@/lib/dates';
import { holdersOf, makeCrewLookup, toAgendaScreening } from '@/lib/agenda';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import { countryName } from '@/lib/countries';
import { getFestivalLinkForScreening } from '@/lib/festival-links';
import { getMapSearchUrl } from '@/lib/maps-utils';
import { getAvailabilityForScreenings, getFilmOverview, getShowDetails, IDFA_AVAILABILITY_FLAG_KEY, refreshShowDetails } from '@/lib/idfa';
import { evaluateBooleanFlag, userContext } from '@/lib/launchdarkly';
import { getVoteLinksForScreening } from '@/lib/vote-links';
import PageHeader, { BackLink } from '@/components/PageHeader';
import { AvatarStack } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AddToCalendarButton from '@/components/AddToCalendarButton';
import ScreeningTickets from '@/components/screening/ScreeningTickets';
import RatingInput from '@/components/RatingInput';
import CrewRatings from '@/components/CrewRatings';
import AvailabilityMark from '@/components/AvailabilityMark';
import QaMark from '@/components/QaMark';
import FilmPlaceEditor from '@/components/screening/FilmPlaceEditor';

export const dynamic = 'force-dynamic';

// The same budget as the availability check in lib/idfa.ts: a slow IDFA means no extra details,
// not a slow page
const SHOW_DETAILS_DEADLINE_MS = 3000;

/** The promise's value, or null if it takes longer than `ms` or fails */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export default async function ScreeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect('/login');
  }

  const { id } = await params;
  const [screening, crew] = await Promise.all([
    getScreening(viewer.visibleEmails, decodeURIComponent(id)),
    getCrew(viewer),
  ]);
  const me = crew.find((member) => member.isMe);

  if (!screening) {
    return (
      <>
        <PageHeader title="Screening" me={me} back={<BackLink href="/screenings" />} />
        <EmptyState
          title="Screening not found"
          action={<ButtonLink href="/screenings" variant="secondary">Back to agenda</ButtonLink>}
        >
          Its ticket may have been deleted or had its details fixed.
        </EmptyState>
      </>
    );
  }

  const lookup = makeCrewLookup(crew);
  const startsAt = screening.dateTime;
  const now = getNow();
  const started = startsAt <= now;
  const venueImage = getVenueBackground(screening.location);
  // End time and Q&A are cleared when a ticket's details are fixed, and normally filled back in by
  // the agenda. Coming straight here (Fix details opens the corrected screening), read them from
  // the IDFA site now, and store them once the page is sent.
  const missingShowDetails = screening.endsAt == null || screening.hasQa == null;
  const [{ festivalLink, overview, liveDetails }, availability, ratings, voteLinks, place] = await Promise.all([
    getFestivalLinkForScreening(screening).then(async (link) => {
      const lookUpDetails = async () =>
        (await evaluateBooleanFlag(IDFA_AVAILABILITY_FLAG_KEY, userContext(viewer.email), true)).value
          ? getShowDetails(link, screening.act, startsAt)
          : null;
      const [overview, liveDetails] = await Promise.all([
        getFilmOverview(link, screening.act),
        // Bounded like the availability check (flag included): past the deadline the page shows what's
        // stored, and the refresh after the response catches up
        missingShowDetails && !started ? withDeadline(lookUpDetails(), SHOW_DETAILS_DEADLINE_MS) : null,
      ]);
      return { festivalLink: link, overview, liveDetails };
    }),
    // Past screenings are skipped inside, so this makes no request once the film has started
    getAvailabilityForScreenings([screening], now, userContext(viewer.email)).then((marks) => marks.get(screening.id)),
    getRatingsForFilm(viewer.visibleEmails, screening.act, screening.festivalYear),
    // Audience Award links for the tickets the viewer holds; only this viewer's page gets them
    getVoteLinksForScreening(viewer, screening),
    // Where the film is set, for the map; shared by every title and showing of the film. Never
    // worth failing this page over (it's opened at the door), e.g. before migration 009 has run
    getFilmPlace(viewer.visibleEmails, screening.act, screening.festivalYear).catch((placeError) => {
      console.warn(`Could not load where "${screening.act}" is set:`, placeError);
      return null;
    }),
  ]);
  const endsAt = screening.endsAt ?? liveDetails?.endsAt ?? null;
  const hasQa = (screening.hasQa ?? liveDetails?.hasQa) === true;
  if (missingShowDetails) {
    after(() => refreshShowDetails(viewer.visibleEmails, [screening], now, userContext(viewer.email)));
  }
  const myRating = ratings.find((rating) => rating.userEmail === viewer.email);
  const crewRatings = ratings.filter((rating) => rating.userEmail !== viewer.email);
  const average = ratings.length > 1 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;
  const holders = holdersOf(toAgendaScreening(screening)).map(lookup);

  return (
    <>
      <PageHeader
        title={`${formatDate(startsAt)} · ${formatTime(startsAt)}`}
        eyebrow={`IDFA ${screening.festivalYear}`}
        me={me}
        back={<BackLink href={`/screenings?year=${screening.festivalYear}`} />}
      />

      <article className="space-y-8">
        <header>
          {venueImage && (
            <div className="relative -mx-4 mb-5 h-28 overflow-hidden sm:mx-0 sm:rounded">
              <Image
                src={venueImage}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 576px"
                className="object-cover grayscale contrast-125"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/40 to-transparent" />
            </div>
          )}
          <h2 className="font-display text-xl text-balance">{screening.act}</h2>
          <p className="mt-2 text-base">
            <span className="font-semibold tabular-nums">{formatTimeRange(startsAt, endsAt)}</span>
            <span className="text-ink-2"> · {formatDate(startsAt, 'long')}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-ink-2">
            {screening.location}
            {hasQa && <QaMark />}
          </p>
          <FilmPlaceEditor
            act={screening.act}
            festivalYear={screening.festivalYear}
            place={
              place?.country && place.source !== 'none'
                ? { name: place.placeName, country: place.country, countryName: countryName(place.country) }
                : null
            }
            noPlace={place?.source === 'none'}
          />
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <AvatarStack members={holders} />
            <span className="min-w-0">{holders.map((member) => (member.isMe ? 'You' : member.name)).join(' & ')}</span>
            {availability && <AvailabilityMark availability={availability} className="ml-auto" />}
          </div>

          {overview && (
            <div className="mt-4 text-sm text-ink-2">
              <p className="text-pretty">{overview}</p>
              {festivalLink && (
                <a
                  href={festivalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hit-44 mt-1.5 inline-flex items-center gap-1 font-semibold text-ink underline-offset-4 hover:underline"
                >
                  Read more on IDFA
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>
          )}

          {/* Wraps rather than scrolls: nothing is cut off, and the 8px gap leaves each small button's
              44px touch area clear of the next row's */}
          <div className="mt-5 flex flex-wrap gap-2">
            {voteLinks.map((link, index) => (
              <ButtonLink key={link.id} href={link.url} external size="sm" icon={<Vote className="h-4 w-4" />}>
                {voteLinks.length > 1 ? `Vote ${index + 1}` : 'Vote'}
              </ButtonLink>
            ))}
            <ButtonLink
              href={getMapSearchUrl(screening.location)}
              external
              variant="secondary"
              size="sm"
              icon={<Navigation className="h-4 w-4" />}
            >
              Directions
            </ButtonLink>
            {!started && (
              <AddToCalendarButton
                title={screening.act}
                location={screening.location}
                startsAt={startsAt.toISOString()}
                endsAt={endsAt ? new Date(endsAt).toISOString() : null}
                hasQa={hasQa}
                url={festivalLink}
              />
            )}
            {/* With an overview, its "Read more on IDFA" link already goes there */}
            {festivalLink && !overview && (
              <ButtonLink href={festivalLink} external variant="secondary" size="sm" icon={<ExternalLink className="h-4 w-4" />}>
                IDFA page
              </ButtonLink>
            )}
          </div>
        </header>

        <section aria-labelledby="tickets-heading">
          <h3 id="tickets-heading" className="label mb-3">
            {screening.ticketCount > 1 ? `${screening.ticketCount} tickets` : 'Ticket'}
          </h3>
          <ScreeningTickets
            tickets={screening.tickets.map((ticket) => ({
              id: ticket.id,
              ownerEmail: ticket.ownerEmail,
              holderEmail: ticket.holderEmail,
              fields: { act: ticket.act, location: ticket.location, date: ticket.date, start: ticket.start },
            }))}
            crew={crew}
            meEmail={viewer.email}
            title={screening.act}
            meta={`${formatDate(startsAt)} · ${formatTimeRange(startsAt, endsAt)} · ${screening.location}`}
          />
        </section>

        <section aria-labelledby="rating-heading">
          <h3 id="rating-heading" className="label mb-3 flex items-baseline">
            Ratings
            {average !== null && (
              <span className="ml-auto normal-case tracking-normal">
                avg <span className="font-display text-base text-ink">{average.toFixed(1)}</span>
              </span>
            )}
          </h3>
          <div className="space-y-4">
            {/* Yours first: the form until it's saved, then a row like everyone else's */}
            <RatingInput
              act={screening.act}
              festivalYear={screening.festivalYear}
              initialRating={myRating?.rating ?? null}
              initialComment={myRating?.comment ?? null}
              started={started}
              me={me}
            />
            {crewRatings.length > 0 && <CrewRatings ratings={crewRatings} lookup={lookup} />}
          </div>
        </section>
      </article>
    </>
  );
}
