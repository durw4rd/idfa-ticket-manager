# Architecture

Next.js 15 App Router app, deployed on Vercel. Server components read Postgres directly; client components call JSON route handlers under `app/api/`. No ORM, no client-side state library. Unit tests (Vitest) cover the pure logic in `lib/`.

```
Browser ──► middleware.ts (NextAuth JWT check; redirects to /login)
   │
   ├─ Server pages (app/screenings, app/tickets, app/films, app/crew) ──► lib/db.ts, lib/groups.ts ──► Postgres (Neon)
   │
   └─ Client components ──► app/api/* route handlers
                               ├─ lib/ticket-extractor.ts ┐
                               ├─ lib/find-festival-link.ts├─► LaunchDarkly AI configs ──► OpenAI / Anthropic
                               ├─ lib/qr-extractor.ts (sharp + jsQR)      (fallback: hardcoded OpenAI GPT-5)
                               └─ lib/storage.ts ──► Vercel Blob (private store)
```

## Domain model

- **Ticket**: one row in `tickets`, one per PDF page. Fields `act` (film title), `location`, `date` (`DD-MM-YYYY` string), `start` (`HH:MM AM/PM` string), plus `owner_email` (the uploader), `holder_email` (who will use it; starts as the uploader), `festival_year`, `starts_at` (absolute `timestamptz`), `qr_hash` (SHA-256 of the decoded QR payload), `qr_code_url` and `pdf_url` (Blob URLs, never sent to the browser), `festival_link`, and `ends_at` / `has_qa` (from the IDFA site, null when unknown).
- **Screening**: not a table. Tickets with the same `act|date|start` are grouped in memory (`groupTicketsIntoScreenings` in `lib/db.ts`). The screening id in URLs is that key, URL-encoded; `parseScreeningKey` splits from the right because titles can contain `|`.
- **Rating**: one per `(user_email, film_key, festival_year)`, 1–10 plus optional comment. `film_key` names the film rather than the ticket title, so "IDFA Hit: X" and "X + Talk" share one rating: the IDFA page ID from the title's festival link (`film:<id>`), else `title:<comparable title>` (`lib/films.ts`). A rating saved under a title key joins the film once that title's page is found; `act` keeps the title it was first rated under, which can be what ties an unlinked title to its film. `getRatingsForYear` returns the title-to-film map along with the ratings, so pages don't rebuild it.
- **Group / group_members**: sharing groups. Members are `owner` or `member`, `invited` or `active`.
- **Crew**: the viewer plus everyone in `visibleEmails`, with a display name, a badge and a colour (`getCrew` in `lib/groups.ts`, `assignCrewLooks` in `lib/display.ts`). A badge brings its own colour; people without one get a colour derived from their email, so everyone sees the same look for the same person.
- **Profile**: `profiles(email, name, badge)`, set on the Crew page. `name` is an optional display name; without one, `getDisplayName` derives it from the email ("alex.jansen@…" → "Alex"). `badge` is one of the cinema icons in `BADGES` (`lib/display.ts`), or null for their initial. A badge is unique within a crew: picking one someone in your crew has is refused, joining a group where someone has yours clears it, and when overlapping crews still put two of the same badge in front of a viewer, whoever joined any group first keeps it (then by email), so every viewer agrees.
- **Vote link**: one row in `vote_links` per Audience Award voting link, owned by the user whose mailbox forwarded it and attached to one of their tickets (or to none). `voted_at` is set when the person it's shown to opens it from the app or taps "Already voted" (the app can't see the vote itself on IDFA's site).
- **Film place**: one row in `film_places` per `(film_key, festival_year)`, keyed like ratings, so every title and showing of a film shares it: where the film mainly takes place, as a place name (or null for the country as a whole), an ISO country code and coordinates, with `source` `ai`, `manual` or `none` (the AI found no single real-world place; a person saying so is `manual` with no country). A manual row, place or no place, is never overwritten by the AI. A place saved under a title key before the title's IDFA page was known is copied onto the film's key once it is, a manual one beating the AI's (`pickStoredPlace` in `lib/films.ts`); the title row stays as an alias for crews that have the title without its link, and a manual save for the film updates it too. `film_place_attempts` holds lookup claims: a lookup claims its film first (`claimFilmPlaceLookup`), so concurrent requests don't pay for it twice, and a failed one leaves the claim to wait 6 hours before the next try.
- **Festival year**: derived from the ticket's date. `/screenings?year=YYYY` picks the year; years before the current one render as a recap.

Schema lives in `migrations/` (run by hand, in order: `000-base-schema.sql`, `001-add-festival-link.sql`, `002-multi-user-multi-year.sql`, `003-ticket-holders-and-profiles.sql`, `004-profile-badges.sql`, `005-screening-end-and-qa.sql`, `006-vote-links.sql`, `007-ratings-by-film.sql`, `008-ratings-by-film-finish.sql`, `009-film-places.sql`, `010-film-places-manual-none.sql`, `011-vote-links-voted.sql`; see `migrations/README.md`).

## Data visibility

The core rule: **reads are scoped to `visibleEmails`, writes to the owner's own email.**

- `getViewer()` in `lib/auth-helpers.ts` returns `{ email, visibleEmails }`, where `visibleEmails` is the user plus every active member of their active groups (`getVisibleEmails` in `lib/groups.ts`).
- Every read in `lib/db.ts` filters `owner_email = ANY(visibleEmails)` (or `user_email` for ratings). Updates and deletes filter on `owner_email = viewer.email`, except `updateTicketHolder`, which also lets the current holder pass a ticket on (`PUT /api/tickets/[id]/holder`); the new holder must be in `visibleEmails`. `setVoteLinkVoted` (`POST`/`DELETE /api/vote-links/[id]/voted`) likewise writes for whoever is shown the link: the holder of the ticket it's on (with the ticket's owner in `visibleEmails`), or the link's owner when no ticket took it.
- API routes start with `const { viewer, error } = await requireAuth(); if (error) return error;`. Server pages call `getViewer()` and redirect to `/login` on null.
- The one route without `requireAuth` is `POST /api/inbound/email` (also left out of `middleware.ts`): Postmark calls it with a shared secret, and the user is found from the token in the address the mail was sent to.
- A voting link is shown only to the current holder of the ticket it is attached to; unattached ones only to their owner. The URLs are single-use, so they are never logged and never part of `AgendaScreening`.
- `updateScreeningShowDetails` writes the end time and Q&A to every visible ticket of a showing, not just the caller's: it is public programme data.
- Film places are public programme data too. `saveFilmPlace` writes the shared `film_places` row for a film when anyone in the caller's crew has a ticket with that title, and `getFilmPlacesForYear` only reads the films the viewer's crew has tickets for. A manual place set by one crew therefore also shows for another crew with the same film; nothing about who set it is stored.
- Emails are always lower-cased with `normalizeEmail` before storage or comparison.

## Key flows

**Upload** (`components/UploadTicket.tsx` → `app/api/upload` → `app/api/process-pdf` → `app/api/tickets/[id]`)
1. The browser renders each PDF page to a PNG with `pdfjs-dist` (`lib/pdf-client-utils.ts`; worker served from `public/pdf.worker.min.mjs`).
2. The original PDF is uploaded to Blob (`/api/upload`, best effort).
3. Each page image is posted to `/api/process-pdf`, one page per request (keeps under Vercel's 4.5 MB body limit). The route: decodes the QR code (cheap) → skips if `qr_hash` is already visible to the user → extracts fields with AI → stores the QR crop in Blob → finds a festival link (reuse existing → IDFA site search + AI pick → hardcoded map in `lib/festival-links.ts`) → inserts with `createTicketUnlessDuplicate` (advisory lock on the QR hash, so concurrent group uploads can't double-insert).
4. The review screen lets the user fix fields; `PATCH /api/tickets/[id]` saves fixes and sends the `ticket-extraction-corrected` metric to LaunchDarkly.

**Sign-in** (`lib/auth.ts`): Google OAuth via NextAuth v4, JWT sessions. `signIn` allows the user if they are in any group (active or invited), else if the `app-access` flag says so, else (only when LaunchDarkly is unreachable) if they are in `ALLOWED_EMAILS`. Sessions last 30 days, so `getViewer` and `requireAuth` re-run that check on every request (`hasAccessEnded`; an "allowed" answer is reused for a minute per server instance, a denial never is): someone removed from every group and from `app-access` gets 401 from the API, and pages send them to `/api/access-ended`, which deletes the session cookie and the browser's stored data and shows a sign-in page that says why. Only a definite answer ends a session; if the database or LaunchDarkly can't be asked, the user stays signed in.

**Screens.** Three tabs, one per job: **Agenda** (`/screenings`: person filter, and three views: list, day timeline, or the map (see below), "Up next" with a one-tap QR, poster export), **Tickets** (`/tickets`: upcoming passes, the next one with its QR showing), **Films** (`/films`: a "to do" list, rated films with crew scores, past-year recap). The to-do list has one card per film you held a ticket for that has finished and that you haven't rated, or that has an unused voting link for you, with the rating form and the Vote buttons together (`buildTodo` in `lib/agenda.ts`, loaded by `lib/reminders.ts`). The Films tab shows how many cards there are, from `GET /api/todo` (a count only), asked again on each page change, on return to the app, and after a rating or vote is saved (`notifyTodoChanged` in `lib/todo-events.ts`). The detail page `/screenings/[id]` has tickets with holders, where the film is set (editable), your rating and the crew's. `/crew` holds your name, groups and sign-out. Server pages load data and pass plain `AgendaScreening`s (`lib/agenda.ts`) plus a server `now` to client components; filtering, clashes and grouping are pure functions in `lib/agenda.ts`.

**QR codes** open in `components/tickets/QrOverlay.tsx`, a fixed white overlay (the Fullscreen API doesn't work on iPhone) that holds a screen wake lock while open. They are served through `GET /api/tickets/[id]/qr`, which re-checks visibility on every request and sets `Cache-Control: private, no-store`.

**Offline wallet** (`public/sw.js`, `components/tickets/OfflineTickets.tsx`): for foyers with no signal. In production builds the Tickets page registers a service worker and keeps an offline copy of the `/tickets` page, the build files it needs, and the QR code of every ticket on it. QR requests still go to the network first, so the server's visibility checks decide while there's a connection; the copy is used only when the request fails, and any page opened offline lands on the stored wallet. Each wallet load drops copies of tickets no longer on it. Sign-out (`clearOfflineCopies` in `lib/offline.ts`) and a `/tickets` visit that redirects to sign-in delete everything. Bump `VERSION` in `sw.js` when its caching rules change.

**Poster** (`app/api/agenda/poster`): an `ImageResponse` PNG of the whole festival for `?who=all|<crew index>`. Fonts are static Archivo TTFs fetched from Google Fonts on first use and cached in memory (`lib/poster-fonts.ts`), falling back to the built-in font. The client shares it with `navigator.share({ files })` or downloads it.

**Film overviews and availability** (`lib/idfa.ts`): a screening's stored festival link names its IDFA page (`/film/<id>` or `/composition/<id>`). The detail page shows that page's intro as a short synopsis (`getFilmOverview`, cached 24h). `getAvailabilityForScreenings` looks up the matching show (same start time) for every upcoming screening and marks it **Sold out** or **Few left** in the agenda, on the detail page and on the poster, so friends can see which screenings they can still join. It's cached for 10 minutes per film with `unstable_cache`, limited to 3s per page load, behind the `idfa-availability` kill switch (default on), and gives no marks when IDFA can't be reached. Screenings without a festival link get neither.

**Groups** (`lib/groups.ts`, `app/api/groups`): one POST endpoint with an `action` field (`create`, `rename`, `invite`, `accept`, `leave`, `remove`). Every membership change runs in a transaction holding a per-group advisory lock (`withGroupLock`). Removing the last owner promotes the longest-standing active member; a group with no active members is deleted.

**End time and Q&A** (`lib/idfa.ts`): tickets only print the start. The matching show on the film's IDFA page has `endOn` and `hasQa`; `getShowDetails` stores them on the ticket at upload, and `refreshShowDetails` (run in `after()` when the agenda loads) fills them in for older tickets and picks up changed end times and added Q&As for upcoming screenings. A showing is matched by its start time, so one IDFA moves to a different time keeps its old values until the ticket's time is corrected. Correcting a ticket's title or time clears the values (and, for a new title, looks up the film's IDFA page again), and the next agenda load fills them back in. `screeningEnd(start, endsAt)` in `lib/dates.ts` returns the real end when known and a 120-minute guess otherwise; clashes, timeline blocks, the calendar export and the wallet all use it.

**Voting links** (`lib/vote-link-extractor.ts`, `lib/vote-links.ts`, `app/api/inbound/email`): a Gmail filter forwards IDFA's "Cast your vote" emails to the user's private address (`<inbound>+<token>@…`, shown on the Crew page). Postmark posts each mail to the webhook. Gmail's own "confirm forwarding" mail arrives the same way; its link is kept on the profile until the user opens it from the Crew page. A voting email is parsed in code (title from the subject, one "Stem nu / Vote now" button per ticket, links only to IDFA hosts); only when that finds nothing does the `vote-link-extraction` AI config read it, picking links by number without seeing the URLs. `saveVoteLinks` deals the links to the owner's tickets for the most recent started showing of that film, one per ticket. Opening one from the app (`components/VoteButtons.tsx`, on the screening page and the Films to-do list) marks it voted; "Already voted" does the same for votes cast from the email.

**Film places and the map** (`lib/find-film-place.ts`, `lib/film-place.ts`, `components/map/`): each film gets one primary place. `findFilmPlace` reads what the festival says about the film from its IDFA page (`getFilmFacts` in `lib/idfa.ts`: description, logline, spoken languages, production countries), and the `film-place-finder` AI config names the place as JSON (`FILM_PLACE_SCHEMA`; production countries are only a clue, since they say where a film was financed, not set). The code checks the country against `lib/countries.ts` and the estimate against the country's box, then the Open-Meteo geocoder (GeoNames data, no key; only the place name and country code are sent) puts the pin on the real place near the model's estimate, falling back to the estimate and then the country's centre. Lookups run in `after()`: on upload, after a title correction finds the new film's page, and on an agenda load (up to 4 films per load), and stop when the `film-place-finder` AI config is disabled; `npm run backfill-film-places` does the rest. Anyone can correct a place on the screening page (`PUT /api/films/place`); a manual place is never overwritten by the AI.

The map is our own SVG: Natural Earth 110m country outlines, simplified and projected (Equal Earth, latitudes 56°S–78°N) once by `npm run generate-world-map` into `lib/world-map-paths.ts` and `lib/countries-data.ts` (the country table, small enough for the picker). It's the agenda's third view (`AgendaView`, next to list and timeline): the agenda page sends the year's places as plain entries (`MapPlaceData`) and the view builds `MapFilm`s (`toMapFilms`) from the screenings the person filter leaves, loading the map code (`components/map/`, via `next/dynamic`) only when the map is opened. The map fills the screen down to the tab bar and is the whole interface: drag to pan, pinch, double-tap or wheel to zoom, plus zoom and fit buttons (`zoomView`, `clampView`, `fitViewBox` in `lib/world-map.ts`); pins and labels are HTML buttons over the SVG (44px targets); pins too close to tap apart merge into numbered clusters (`clusterPins`) that zoom in when tapped, or are selected together when they can't split. Tapping a place opens a panel over the bottom of the map with its films, each linking to its screening; films not on the map are listed behind a button at the top.

## LaunchDarkly

`lib/launchdarkly.ts` holds one shared client on `globalThis` (survives dev hot reloads), used for both flags and AI configs. When LaunchDarkly can't be reached, flags fall back to code defaults and AI configs to the hardcoded OpenAI call, so the app runs without `LD_SDK_KEY`. `evaluateBooleanFlag` returns `{ value, available }` so callers can tell "flag off" from "LaunchDarkly down"; the only plain flags are `app-access` and `idfa-availability`. Route handlers that send events call `after(flushLdEvents)`.

Every AI feature is an AI config: `ticket-extraction`, `festival-link-finder`, `vote-link-extraction` and `film-place-finder`, each with an OpenAI GPT-5.4 mini variation (the default in dev and production), a Claude Sonnet 5.5 variation, and the prompt and Output format mirrored from the code's `*_PROMPT` and `*_SCHEMA`. Calls go through `invokeAgentConfig` (`lib/agent-config.ts`, wrapping `config({ key, handler }).invoke(...)` from `@launchdarkly/ai-server` 1.x with OpenAI and Claude handlers), which first evaluates the config with `variationDetail`, because `invoke()` throws the same "not enabled" error for a disabled config and an unknown one. It returns one of three results:

- **Served:** the model's response, from the provider and model the variation names.
- **Disabled** (`{ disabled: true }`: targeting off, or a rule serving the disabled variation, i.e. `_ldMeta.enabled` false): the config is the feature's off switch, and the caller makes no AI call at all. Ticket extraction fails the page with "Reading tickets is switched off"; the festival link keeps only exact title matches; voting emails outside the known template aren't read; films get no new place (they're tried again later).
- **Unavailable** (null: no `LD_SDK_KEY`, client not initialised, config not found or another evaluation error, or the model call failing): the caller falls back to a direct OpenAI call to `gpt-5.4-mini` with the same prompt constant.

There are no separate kill-switch flags for AI.

The festival link finder doesn't ask the model to know URLs. It searches the public GraphQL API behind the IDFA website (`searchArchive` on `my.idfa.nl/api/graphql/institute` for films of that edition year, `searchGlobal` on `.../global` for shorts programs, which only exist for the current edition). When exactly one result has the ticket's title (ignoring case, accents, punctuation and a leading article), it is used without a model; otherwise the model picks the matching result by number. Either way the code builds the URL from that result's ID, so most links are found even when the AI provider is unavailable.

## Dates and time zones

All ticket times are Amsterdam wall-clock times; servers run in UTC. Always go through `lib/dates.ts` (`parseTicketDateTime`, `dayKey`, `formatDate`, `isToday`, `getNow`). Never call `new Date()` for "now" in rendering code: use `getNow()` so `TEST_DATE` works.

## Storage

`lib/storage.ts`: files go to the private Blob store (`PRIVATE_BLOB_READ_WRITE_TOKEN`; uploads fail if it isn't set). Paths are `users/<sha256(email)[:16]>/<qr-codes|tickets>/<uuid>`. `readTicketFile` only reads `*.blob.vercel-storage.com` URLs, and `isOwnTicketPdfUrl` validates PDF URLs the client sends back.

## Directory map

| Path | What's there |
|---|---|
| `app/screenings/page.tsx` | Agenda (loads data, renders `components/agenda/AgendaView`) |
| `app/screenings/[id]/page.tsx` | Screening detail: tickets and holders, ratings |
| `app/tickets`, `app/films` | Ticket wallet; rating queue and rated films |
| `app/upload`, `app/crew`, `app/login` | Upload wizard, profile and sharing groups, sign-in page |
| `app/api/` | JSON route handlers (all `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`) |
| `components/ui/` | Design-system primitives (Button, Avatar, Chip, Sheet, …) |
| `components/` | Feature components by area (`agenda/`, `tickets/`, `screening/`, `upload/`, `map/`); client components are marked `'use client'` |
| `lib/agenda.ts` | Client-safe agenda logic: serialisation, filters, clashes, rating queue |
| `lib/films.ts` | Which titles are the same film (film keys for ratings and places), festival link parsing, `comparableTitle` |
| `lib/find-film-place.ts`, `lib/film-place.ts` | Where a film takes place: lookup (IDFA, model, geocoder) and its pure prompt, schema and checks |
| `lib/world-map.ts`, `lib/world-map-paths.ts`, `lib/countries.ts`, `lib/countries-data.ts` | Map projection, framing and clustering; generated outlines and country table (`scripts/generate-world-map.ts`) |
| `lib/db.ts` | All ticket and rating SQL, screening grouping |
| `lib/idfa.ts` | IDFA website GraphQL client: search, film overviews, ticket availability, end times and Q&A |
| `lib/vote-link-extractor.ts`, `lib/vote-links.ts` | Reading forwarded voting emails; forwarding addresses and vote link SQL |
| `lib/groups.ts` | Group SQL, visibility, locking |
| `lib/types.ts` | Shared interfaces |
| `lib/venue-backgrounds.ts`, `public/bcg-*` | Venue name → banner image on the detail page |
| `docs/ux-research.md` | Baseline usability findings and the think-aloud script |
| `scripts/` | One-off maintenance scripts (plain Node, read `.env.local`) |
| `migrations/` | Hand-run SQL |

## Known debt

- `@vercel/postgres` is deprecated (Neon's own driver replaces it). Used in `lib/db.ts`, `lib/groups.ts`, and the scripts.
- `lib/festival-links.ts` hardcodes IDFA 2025 film URLs; it only matters as the last fallback.
- Tests cover pure functions only; database queries and UI flows are verified by running the app.
