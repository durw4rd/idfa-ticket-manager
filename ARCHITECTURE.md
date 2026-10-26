# Architecture

Next.js 15 App Router app, deployed on Vercel. Server components read Postgres directly; client components call JSON route handlers under `app/api/`. No ORM, no client-side state library, no test suite.

```
Browser ──► middleware.ts (NextAuth JWT check; redirects to /login)
   │
   ├─ Server pages (app/screenings, app/settings) ──► lib/db.ts, lib/groups.ts ──► Postgres (Neon)
   │
   └─ Client components ──► app/api/* route handlers
                               ├─ lib/ticket-extractor.ts ┐
                               ├─ lib/find-festival-link.ts├─► LaunchDarkly AgentControl ─► OpenAI / Anthropic
                               ├─ lib/qr-extractor.ts (sharp + jsQR)      (fallback: hardcoded OpenAI GPT-5)
                               └─ lib/storage.ts ──► Vercel Blob (private store)
```

## Domain model

- **Ticket**: one row in `tickets`, one per PDF page. Fields `act` (film title), `location`, `date` (`DD-MM-YYYY` string), `start` (`HH:MM AM/PM` string), plus `owner_email`, `festival_year`, `starts_at` (absolute `timestamptz`), `qr_hash` (SHA-256 of the decoded QR payload), `qr_code_url` and `pdf_url` (Blob URLs, never sent to the browser), `festival_link`.
- **Screening**: not a table. Tickets with the same `act|date|start` are grouped in memory (`groupTicketsIntoScreenings` in `lib/db.ts`). The screening id in URLs is that key, URL-encoded; `parseScreeningKey` splits from the right because titles can contain `|`.
- **Rating**: one per `(user_email, act, festival_year)`, 1–10 plus optional comment.
- **Group / group_members**: sharing groups. Members are `owner` or `member`, `invited` or `active`.
- **Festival year**: derived from the ticket's date. `/screenings?year=YYYY` picks the year; years before the current one render as a recap.

Schema lives in `migrations/` (run by hand, in order: `000-base-schema.sql`, `add-festival-link.sql`, `002-multi-user-multi-year.sql`).

## Data visibility

The core rule: **reads are scoped to `visibleEmails`, writes to the owner's own email.**

- `getViewer()` in `lib/auth-helpers.ts` returns `{ email, visibleEmails }`, where `visibleEmails` is the user plus every active member of their active groups (`getVisibleEmails` in `lib/groups.ts`).
- Every read in `lib/db.ts` filters `owner_email = ANY(visibleEmails)` (or `user_email` for ratings). Updates and deletes filter on `owner_email = viewer.email`.
- API routes start with `const { viewer, error } = await requireAuth(); if (error) return error;`. Server pages call `getViewer()` and redirect to `/login` on null.
- Emails are always lower-cased with `normalizeEmail` before storage or comparison.

## Key flows

**Upload** (`components/UploadTicket.tsx` → `app/api/upload` → `app/api/process-pdf` → `app/api/tickets/[id]`)
1. The browser renders each PDF page to a PNG with `pdfjs-dist` (`lib/pdf-client-utils.ts`; worker served from `public/pdf.worker.min.mjs`).
2. The original PDF is uploaded to Blob (`/api/upload`, best effort).
3. Each page image is posted to `/api/process-pdf`, one page per request (keeps under Vercel's 4.5 MB body limit). The route: decodes the QR code (cheap) → skips if `qr_hash` is already visible to the user → extracts fields with AI → stores the QR crop in Blob → finds a festival link (reuse existing → IDFA site search + AI pick → hardcoded map in `lib/festival-links.ts`) → inserts with `createTicketUnlessDuplicate` (advisory lock on the QR hash, so concurrent group uploads can't double-insert).
4. The review screen lets the user fix fields; `PATCH /api/tickets/[id]` saves fixes and sends the `ticket-extraction-corrected` metric to LaunchDarkly.

**Sign-in** (`lib/auth.ts`): Google OAuth via NextAuth v4, JWT sessions. `signIn` allows the user if they are in any group (active or invited), else if the `app-access` flag says so, else (only when LaunchDarkly is unreachable) if they are in `ALLOWED_EMAILS`.

**QR codes** are served through `GET /api/tickets/[id]/qr`, which re-checks visibility on every request and sets `Cache-Control: private, no-store`.

**Groups** (`lib/groups.ts`, `app/api/groups`): one POST endpoint with an `action` field (`create`, `invite`, `accept`, `leave`, `remove`). Every membership change runs in a transaction holding a per-group advisory lock (`withGroupLock`). Removing the last owner promotes the longest-standing active member; a group with no active members is deleted.

## LaunchDarkly

`lib/launchdarkly.ts` holds one shared client on `globalThis` (survives dev hot reloads), used for both flags and AgentControl configs. Every LaunchDarkly call has a code fallback, so the app runs without `LD_SDK_KEY`. `evaluateBooleanFlag` returns `{ value, available }` so callers can tell "flag off" from "LaunchDarkly down". Route handlers that send events call `after(flushLdEvents)`.

AI calls go through `config({ key, handler }).invoke(...)` from `@launchdarkly/ai-server` with OpenAI and Claude handlers; the served variation decides the provider and model. If that throws, the code falls back to a direct OpenAI call to `gpt-5.4-mini` with the same prompt constant.

The festival link finder doesn't ask the model to know URLs. It searches the public GraphQL API behind the IDFA website (`searchArchive` on `my.idfa.nl/api/graphql/institute` for films of that edition year, `searchGlobal` on `.../global` for shorts programs, which only exist for the current edition). The model then picks the matching result by number, and the code builds the URL from that result's ID.

## Dates and time zones

All ticket times are Amsterdam wall-clock times; servers run in UTC. Always go through `lib/dates.ts` (`parseTicketDateTime`, `dayKey`, `formatDate`, `isToday`, `getNow`). Never call `new Date()` for "now" in rendering code: use `getNow()` so `TEST_DATE` works.

## Storage

`lib/storage.ts`: files go to the private Blob store (`PRIVATE_BLOB_READ_WRITE_TOKEN`; uploads fail if it isn't set). Paths are `users/<sha256(email)[:16]>/<qr-codes|tickets>/<uuid>`. `readTicketFile` only reads `*.blob.vercel-storage.com` URLs, and `isOwnTicketPdfUrl` validates PDF URLs the client sends back.

## Directory map

| Path | What's there |
|---|---|
| `app/screenings/page.tsx` | Main schedule (server component): day groups, Up next, recap for past years |
| `app/screenings/[id]/page.tsx` | Screening detail: QR codes, ratings, ticket actions |
| `app/upload`, `app/settings`, `app/login` | Upload wizard, sharing groups, sign-in page |
| `app/api/` | JSON route handlers (all `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`) |
| `components/` | UI components; client components are marked `'use client'` |
| `lib/db.ts` | All ticket and rating SQL, screening grouping |
| `lib/groups.ts` | Group SQL, visibility, locking |
| `lib/types.ts` | Shared interfaces |
| `lib/venue-backgrounds.ts`, `public/bcg-*` | Venue name → card background image |
| `scripts/` | One-off maintenance scripts (plain Node, read `.env.local`) |
| `migrations/` | Hand-run SQL |

## Known debt

- `@vercel/postgres` is deprecated (Neon's own driver replaces it). Used in `lib/db.ts`, `lib/groups.ts`, and the scripts.
- `lib/festival-links.ts` hardcodes IDFA 2025 film URLs; it only matters as the last fallback.
- `next.config.js` has a no-op `webpack` hook and a `serverActions` limit, but the app has no server actions.
- No automated tests. Verify changes with `npm run build` and `npm run lint`, and by running the app.
