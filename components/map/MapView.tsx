'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, MapPin as MapPinIcon, X } from 'lucide-react';
import type { CrewMember, MapFilm } from '@/lib/types';
import { makeCrewLookup } from '@/lib/agenda';
import { countryName } from '@/lib/countries';
import { formatDate, formatTime } from '@/lib/dates';
import { project } from '@/lib/world-map';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import WorldMap, { MAP_OVERLAY, type MapPin } from './WorldMap';

interface Place {
  pin: MapPin;
  country: string;
  name: string | null;
  lat: number;
  lon: number;
  films: MapFilm[];
}

/** Films at the same spot share a pin (two films about Kabul are one place with two films) */
function groupByPlace(films: MapFilm[]): Place[] {
  const places = new Map<string, Place>();
  for (const film of films) {
    if (!film.place) continue;
    const { lat, lon, country, name } = film.place;
    const id = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    let place = places.get(id);
    if (!place) {
      place = {
        pin: { id, point: project(lon, lat), label: name ?? countryName(country), ariaLabel: '', count: 0, mine: false },
        country,
        name,
        lat,
        lon,
        films: [],
      };
      places.set(id, place);
    }
    place.films.push(film);
    place.pin.count = place.films.length;
    place.pin.mine ||= film.isMine;
  }
  for (const place of places.values()) {
    const where = place.name ? `${place.name}, ${countryName(place.country)}` : countryName(place.country);
    place.pin.ariaLabel = `${where}: ${place.films.length === 1 ? place.films[0].title : `${place.films.length} films`}`;
  }
  return Array.from(places.values());
}

const overlay = { [MAP_OVERLAY]: '' };

/**
 * The agenda's map view: the map fills the screen down to the tab bar, and everything about a
 * film is reached through it. Tapping a place opens a panel over the bottom of the map with its
 * films, each linking to its screening; films not on the map are one tap away at the top.
 */
export default function MapView({ films, crew }: { films: MapFilm[]; crew: CrewMember[] }) {
  const lookup = useMemo(() => makeCrewLookup(crew), [crew]);
  const places = useMemo(() => groupByPlace(films), [films]);
  const pins = useMemo(() => places.map((place) => place.pin), [places]);
  const fitPoints = useMemo(() => pins.map((pin) => pin.point), [pins]);
  const fitKey = useMemo(() => pins.map((pin) => pin.id).sort().join(';'), [pins]);
  const countries = useMemo(() => new Set(places.map((place) => place.country)), [places]);
  const pending = films.filter((film) => !film.place && !film.noPlace);
  const unplaceable = films.filter((film) => film.noPlace);
  const placedCount = films.length - pending.length - unplaceable.length;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showUnplaced, setShowUnplaced] = useState(false);
  const selected = places.filter((place) => selectedIds.includes(place.pin.id));
  // Another person's films: nothing they don't have stays selected
  useEffect(() => setSelectedIds([]), [fitKey]);

  // The map takes the screen from where it starts down to the tab bar
  const boxRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      if (box) setTop(Math.round(box.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      setPanelHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => setPanelHeight(panel.offsetHeight + 8));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [selected.length]);

  const notOnMap = pending.length + unplaceable.length;

  return (
    <div
      ref={boxRef}
      className="-mx-4 w-[calc(100%+2rem)] overflow-hidden border-y border-line sm:mx-0 sm:w-full sm:rounded sm:border"
      // Down to the tab bar (4rem, theme spacing.tabbar) and the home indicator, never under 20rem
      style={{
        height: top === null ? '60dvh' : `max(20rem, calc(100dvh - ${top}px - 4rem - env(safe-area-inset-bottom) - 0.75rem))`,
      }}
    >
      <WorldMap
        pins={pins}
        countries={countries}
        selectedIds={selectedIds}
        onSelect={setSelectedIds}
        fitPoints={fitPoints}
        fitKey={fitKey}
        bottomInset={panelHeight}
      >
        <div {...overlay} className="absolute left-2 top-2 z-30 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2">
          <p className="rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink-2 shadow-sm">
            <span className="font-semibold tabular-nums text-ink">{placedCount}</span> {placedCount === 1 ? 'film' : 'films'} ·{' '}
            <span className="font-semibold tabular-nums text-ink">{countries.size}</span>{' '}
            {countries.size === 1 ? 'country' : 'countries'}
            <span className="ml-2 inline-flex items-center gap-1 align-[-1px]">
              <span className="h-2 w-2 rounded-full bg-spark ring-1 ring-ink" aria-hidden />
              yours
            </span>
          </p>
          {notOnMap > 0 && (
            <Button variant="secondary" size="sm" className="shadow-sm" onClick={() => setShowUnplaced(true)}>
              {notOnMap} not on the map
            </Button>
          )}
        </div>

        {selected.length > 0 && (
          <section
            ref={panelRef}
            {...overlay}
            aria-live="polite"
            aria-label="Selected places"
            className="absolute inset-x-2 bottom-2 z-40 max-h-[55%] overflow-y-auto overscroll-contain rounded border border-line bg-surface p-4 pr-12 shadow-lg"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label="Close"
              icon={<X className="h-5 w-5" aria-hidden />}
              onClick={() => setSelectedIds([])}
            />
            <div className="space-y-4">
              {selected.map((place) => (
                <div key={place.pin.id}>
                  <p className="flex items-start gap-2 text-sm">
                    <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-semibold">{place.name ?? countryName(place.country)}</span>
                      {place.name && <span className="text-ink-2"> · {countryName(place.country)}</span>}
                    </span>
                  </p>
                  <ul className="mt-1 divide-y divide-line">
                    {place.films.map((film) => (
                      <FilmRow key={film.key} film={film} lookup={lookup} />
                    ))}
                  </ul>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hit-44 mt-1 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    Open in Maps
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </WorldMap>

      <Sheet open={showUnplaced} onClose={() => setShowUnplaced(false)} title="Not on the map">
        {pending.length > 0 && (
          <section className="mb-4">
            <p className="text-sm text-ink-2">
              {pending.length === 1
                ? "Still being placed, or there's no IDFA page to place it from."
                : "Still being placed, or there's no IDFA page to place them from."}{' '}
              You can set where a film is set on its page.
            </p>
            <ul className="mt-1 divide-y divide-line">
              {pending.map((film) => (
                <FilmRow key={film.key} film={film} lookup={lookup} />
              ))}
            </ul>
          </section>
        )}
        {unplaceable.length > 0 && (
          <section>
            <h3 className="label mt-2">No single place</h3>
            <ul className="mt-1 divide-y divide-line">
              {unplaceable.map((film) => (
                <FilmRow key={film.key} film={film} lookup={lookup} />
              ))}
            </ul>
          </section>
        )}
      </Sheet>
    </div>
  );
}

function FilmRow({ film, lookup }: { film: MapFilm; lookup: (email: string) => CrewMember }) {
  const startsAt = new Date(film.startsAt);
  return (
    <li>
      <Link href={film.href} className="flex min-h-14 items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base leading-tight">{film.title}</span>
          <span className="mt-0.5 block text-sm text-ink-3">
            {formatDate(startsAt)} · {formatTime(startsAt)} · {film.location}
          </span>
        </span>
        <AvatarStack members={film.holders.map(lookup)} size="xs" />
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}
