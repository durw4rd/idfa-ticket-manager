import type { Badge } from './display';

export interface Ticket {
  id: string;
  act: string;
  location: string;
  date: string; // DD-MM-YYYY format
  start: string; // HH:MM AM/PM format
  qrCodeUrl: string; // '' for tickets from older editions, which have no QR code
  pdfUrl: string;
  transactionId?: string;
  festivalLink?: string; // URL to IDFA festival page
  ownerEmail: string; // Who uploaded the ticket; only they can edit or delete it
  holderEmail: string; // Who will use the ticket; the owner or the holder can reassign it
  festivalYear: number;
  startsAt: Date;
  // Duplicate key: SHA-256 of the decoded QR payload, or for a ticket without a QR code (older
  // editions) of its PDF file and page; see lib/ticket-dedup.ts
  qrHash?: string | null;
  endsAt?: Date | null; // From the IDFA site, not the ticket; null when IDFA hasn't told us
  hasQa?: boolean | null; // Q&A after the film, from the IDFA site; null when unknown
  createdAt: Date;
}

export interface Screening {
  id: string; // Composite key: act|date|start
  act: string;
  location: string;
  date: string;
  start: string;
  festivalYear: number;
  dateTime: Date; // Parsed date+time for sorting/filtering
  endsAt: Date | null; // See Ticket.endsAt
  hasQa: boolean | null;
  tickets: Ticket[];
  ticketCount: number;
}

export interface ExtractedTicketFields {
  act: string;
  location: string;
  date: string;
  start: string;
}

export interface ProcessedTicketResult {
  ticketId: string;
  screeningKey: string;
  success: boolean;
  duplicate?: boolean;
  extracted?: ExtractedTicketFields;
  error?: string;
}

export interface PDFProcessingSummary {
  totalPages: number;
  successful: number;
  failed: number;
  duplicates: number;
  tickets: ProcessedTicketResult[];
}

export interface Rating {
  id: string;
  userEmail: string;
  filmKey: string; // Which film (see lib/films.ts); one rating per person, film and year
  act: string; // The title it was first rated under (see upsertRating)
  festivalYear: number;
  rating: number; // 1-10
  comment?: string | null; // Optional user comment
  createdAt: Date;
  updatedAt: Date;
}

/** Where a film mainly takes place: one per film and festival year (film_places, migration 009) */
export interface FilmPlace {
  placeName: string | null; // Town, village or region; null means the country as a whole
  country: string | null; // ISO 3166-1 alpha-2; null when source is 'none'
  lat: number | null;
  lon: number | null;
  source: 'ai' | 'manual' | 'none'; // 'none': the AI found no single real-world place; 'manual' with no country: a person said so
}

/** A film as the agenda's map view gets it (toMapFilms in lib/agenda.ts): plain JSON */
export interface MapFilm {
  key: string; // The film (see lib/films.ts); every title it was shown under is merged
  title: string; // The title of its first showing
  href: string; // The first showing's detail page
  startsAt: string; // The first showing, ISO timestamp
  location: string; // The first showing's venue
  place: { name: string | null; country: string; lat: number; lon: number } | null; // null: not placed (yet)
  noPlace: boolean; // Looked up: the film has no single real-world place
  holders: string[]; // Everyone holding a ticket for any showing, in ticket order
  isMine: boolean; // The viewer holds a ticket
}

/**
 * The year's film places as the agenda page sends them to the browser (from getFilmPlacesForYear
 * in lib/db.ts): plain entries, since Maps don't serialise. AgendaView turns them into MapFilms for
 * the screenings the person filter leaves.
 */
export interface MapPlaceData {
  keysByTitle: Array<[string, string]>;
  places: Array<[string, Pick<FilmPlace, 'placeName' | 'country' | 'lat' | 'lon' | 'source'>]>;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
  invitedBy: string | null; // Who invited you (null for the group's creator)
  members: GroupMember[];
}

export interface GroupMember {
  userEmail: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
}

// Someone whose tickets the viewer can see: the viewer or an active member of a shared group
export interface CrewMember {
  email: string;
  name: string;
  color: number; // Index into the crew colour palette: the badge's colour, else derived from the email (see getCrew)
  badge: Badge | null; // The avatar icon they picked; null shows their initial
  isMe: boolean;
  groups: CrewGroup[]; // The viewer's groups this person is in, oldest first; the viewer's own is all of them
}

// One of the viewer's groups, as shown in crew hints and the agenda's person filter
export interface CrewGroup {
  id: string;
  name: string;
}

// Ticket sales on the IDFA site for a screening; screenings with plenty left aren't marked
/** A festival year someone visible has tickets for, for the year picker */
export interface FestivalYear {
  year: number;
  tickets: number;
}

export type TicketAvailability = 'sold-out' | 'low';

// A screening as sent to client components: plain JSON, no blob URLs
export interface AgendaTicket {
  id: string;
  ownerEmail: string;
  holderEmail: string;
}

export interface AgendaScreening {
  id: string; // act|date|start, see screeningKey in lib/db.ts
  act: string;
  location: string;
  festivalYear: number;
  startsAt: string; // ISO timestamp
  endsAt: string | null; // ISO timestamp from the IDFA site; null means assume a typical length (screeningEnd)
  hasQa: boolean; // A Q&A follows the film, according to the IDFA site
  festivalLink: string | null;
  availability: TicketAvailability | null; // Filled in by withAvailability for upcoming screenings
  tickets: AgendaTicket[];
}
