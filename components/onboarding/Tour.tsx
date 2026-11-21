'use client';

import { useRef, useState } from 'react';
import { CalendarDays, Star, Ticket, Users, type LucideIcon } from 'lucide-react';

const CARDS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarDays,
    title: 'Agenda',
    text: "Everyone's screenings in one list. Filter by person, see clashes on the timeline, or find where each film is set on the map.",
  },
  {
    icon: Ticket,
    title: 'Tickets',
    text: 'Your next QR code, ready at the door. Open it once with signal and it works offline in the foyer too.',
  },
  {
    icon: Star,
    title: 'Films',
    text: "Rate what you've seen, compare with your crew, and vote for the Audience Award with the links IDFA emails you.",
  },
  {
    icon: Users,
    title: 'Crew',
    text: 'Tap your avatar at the top for your groups, invites and badge. On a screening, hand a ticket to a friend.',
  },
];

/** A row of swipeable cards, one per part of the app, with dots that follow the scroll */
export default function Tour() {
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  const goTo = (index: number) => {
    const el = scroller.current;
    el?.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div>
      <div
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const el = event.currentTarget;
          setCurrent(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {CARDS.map(({ icon: Icon, title, text }, i) => (
          <section
            key={title}
            aria-label={`${i + 1} of ${CARDS.length}: ${title}`}
            className="w-full shrink-0 snap-center px-4"
          >
            <div className="flex min-h-56 flex-col rounded border border-line bg-surface p-6">
              <Icon className="h-8 w-8 text-ink-2" strokeWidth={1.5} />
              <h2 className="mt-4 font-display text-lg">{title}</h2>
              <p className="mt-1 text-ink-2">{text}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1">
        {CARDS.map(({ title }, i) => (
          <button
            key={title}
            type="button"
            aria-label={`Show ${title}`}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => goTo(i)}
            className="hit-44 flex h-6 w-6 items-center justify-center"
          >
            <span className={`h-1.5 rounded-full transition-all ${i === current ? 'w-4 bg-ink' : 'w-1.5 bg-line-strong'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
