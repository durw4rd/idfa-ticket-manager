import Image from 'next/image';
import { redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink, Navigation } from 'lucide-react';
import { getScreening, getRatingsByMovie } from '@/lib/db';
import { getCrew } from '@/lib/groups';
import { getViewer } from '@/lib/auth-helpers';
import { formatDate, formatTime, getNow } from '@/lib/dates';
import { holdersOf, makeCrewLookup, toAgendaScreening } from '@/lib/agenda';
import { getVenueBackground } from '@/lib/venue-backgrounds';
import { getFestivalLinkForScreening } from '@/lib/festival-links';
import { getMapSearchUrl } from '@/lib/maps-utils';
import PageHeader from '@/components/PageHeader';
import { AvatarStack } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AddToCalendarButton from '@/components/AddToCalendarButton';
import ScreeningTickets from '@/components/screening/ScreeningTickets';
import RatingInput from '@/components/RatingInput';
import CrewRatings from '@/components/CrewRatings';

export const dynamic = 'force-dynamic';

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
  const started = startsAt <= getNow();
  const venueImage = getVenueBackground(screening.location);
  const [festivalLink, ratings] = await Promise.all([
    getFestivalLinkForScreening(screening),
    getRatingsByMovie(viewer.visibleEmails, screening.act, screening.festivalYear),
  ]);
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
            <span className="font-semibold tabular-nums">{formatTime(startsAt)}</span>
            <span className="text-ink-2"> · {formatDate(startsAt, 'long')}</span>
          </p>
          <p className="text-ink-2">{screening.location}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <AvatarStack members={holders} />
            <span>{holders.map((member) => (member.isMe ? 'You' : member.name)).join(' & ')}</span>
          </div>

          <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
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
                url={festivalLink}
              />
            )}
            {festivalLink && (
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
            meta={`${formatDate(startsAt)} · ${formatTime(startsAt)} · ${screening.location}`}
          />
        </section>

        <section aria-labelledby="rating-heading">
          <h3 id="rating-heading" className="label mb-3">
            Your rating
          </h3>
          <RatingInput
            act={screening.act}
            festivalYear={screening.festivalYear}
            initialRating={myRating?.rating ?? null}
            initialComment={myRating?.comment ?? null}
            started={started}
          />
        </section>

        {crewRatings.length > 0 && (
          <section aria-labelledby="crew-heading">
            <h3 id="crew-heading" className="label mb-3 flex items-baseline">
              Crew
              {average !== null && (
                <span className="ml-auto normal-case tracking-normal">
                  avg <span className="font-display text-base text-ink">{average.toFixed(1)}</span>
                </span>
              )}
            </h3>
            <CrewRatings ratings={crewRatings} lookup={lookup} />
          </section>
        )}
      </article>
    </>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <ButtonLink
      href={href}
      variant="ghost"
      size="icon"
      aria-label="Back to agenda"
      className="-ml-3"
      icon={<ArrowLeft className="h-5 w-5" />}
    />
  );
}
