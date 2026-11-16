# IDFA Ticket Manager

A small web app for keeping IDFA (International Documentary Film Festival Amsterdam) tickets in one place. Upload the PDF tickets you get when you buy tickets; the app reads each one with AI, groups them by screening, and gives you a phone-friendly schedule with the QR codes ready to scan at the door.

## What it does

- **Upload tickets.** Drop in one or more PDFs (one ticket per page). The app pulls out the film, venue, date, and time, and asks you to confirm or fix them. Re-uploading a ticket you or your group already have is skipped.
- **See your schedule.** Screenings are grouped by day, with an "Up next" card, a ticket count per screening, directions to the venue, a link to the film's IDFA page, and an "Add to calendar" button. End times and whether a Q&A follows come from the IDFA site.
- **Scan at the door.** Each screening shows its QR codes, with a fullscreen mode for scanning.
- **Share with your group.** Invite people on the Sharing page. Everyone in a group sees each other's screenings, tickets, and ratings.
- **Rate films.** Give each film 1–10 with an optional comment. Past festival years turn into a recap of what you saw and how you rated it.
- **Vote for the Audience Award.** Forward IDFA's "Cast your vote" emails to your private address (Crew page) and each ticket's holder gets a Vote button on the screening.

## Using it

1. Sign in with Google. Access is by invite: you need to be allowed by the `app-access` LaunchDarkly flag, or invited to a group by someone already using the app.
2. Go to **Upload**, choose your ticket PDFs, and check the extracted details on the review screen.
3. Open **Screenings** to see your schedule. Tap a screening for its QR codes, ratings, and ticket actions (edit details, delete).
4. Optionally, open **Sharing** to create a group and invite others.

## Running locally

Requires Node.js 22 (`nvm use` reads `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. To pull env vars from the linked Vercel project instead, run `vercel env pull .env.local`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | yes | NextAuth session secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client. Redirect URI: `<origin>/api/auth/callback/google` |
| `DATABASE_URL` (or `POSTGRES_URL`) | yes | Postgres connection string (Neon) |
| `PRIVATE_BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob store with private access, for QR codes and ticket PDFs |
| `OPENAI_API_KEY` | yes | Fallback model, and OpenAI variations in LaunchDarkly |
| `ANTHROPIC_API_KEY` | if used | Only needed when a LaunchDarkly variation serves a Claude model |
| `LD_SDK_KEY` | recommended | LaunchDarkly server SDK key. Without it the app uses hardcoded fallbacks |
| `ALLOWED_EMAILS` | optional | Comma-separated sign-in allowlist, used only when LaunchDarkly is unreachable |
| `NEXTAUTH_URL` | optional | Leave unset on Vercel (NextAuth uses the request's host); defaults to `http://localhost:3000` whenever `VERCEL_URL` is empty, including a `.env.local` from `vercel env pull` |
| `LD_SERVICE_NAME` | optional | Labels AI traces in LaunchDarkly (default `idfa-manager`) |
| `TEST_DATE` | optional | Pretend "now" is this ISO date, to test today/past styling |
| `INBOUND_EMAIL_ADDRESS` | optional | The Postmark server's inbound address (`<hash>@inbound.postmarkapp.com`). Turns on voting links; see below |
| `INBOUND_WEBHOOK_SECRET` | with the above | Password Postmark sends with each inbound mail (`openssl rand -hex 24`) |

### Database

There is no migration runner; run the SQL by hand. For a new database, run [`migrations/000-base-schema.sql`](migrations/000-base-schema.sql), then [`migrations/add-festival-link.sql`](migrations/add-festival-link.sql), then [`migrations/002-multi-user-multi-year.sql`](migrations/002-multi-user-multi-year.sql), [`migrations/003-ticket-holders-and-profiles.sql`](migrations/003-ticket-holders-and-profiles.sql) , [`migrations/004-profile-badges.sql`](migrations/004-profile-badges.sql), [`migrations/005-screening-end-and-qa.sql`](migrations/005-screening-end-and-qa.sql) and [`migrations/006-vote-links.sql`](migrations/006-vote-links.sql). Run a new migration before deploying the code that needs it. Migration 002 assigns existing tickets to a hardcoded owner and seeds a group; edit the emails in it first.

### LaunchDarkly

The app expects these in its LaunchDarkly project. Each has a code fallback, so the app still works without them.

| Key | Type | Purpose |
|---|---|---|
| `app-access` | Boolean flag | Who may sign in (context kind `user`, key = email) |
| `ticket-extraction` | AgentControl config (completion) | Model and prompt for reading tickets. Prompt: `TICKET_EXTRACTION_PROMPT` in `lib/ticket-extractor.ts` |
| `festival-link-finder` | AgentControl config (completion) | Model and prompt that picks a film's IDFA page from IDFA site search results. Prompt: `FESTIVAL_LINK_PROMPT` in `lib/find-festival-link.ts`, with variables `{{movieTitle}}`, `{{festivalYear}}`, `{{candidates}}` |
| `festival-link-ai` | Boolean flag | Kill switch for the festival-link lookup |
| `idfa-availability` | Boolean flag | Kill switch for the routine calls to the IDFA site: availability marks and the end time / Q&A refresh |
| `ticket-extraction-corrected` | Numeric metric | `1` when a user corrected the AI's extraction on the review screen, `0` otherwise |

| `vote-link-extraction` | AgentControl config (completion) | Model and prompt that reads a voting email the code couldn't parse. Prompt: `VOTE_LINK_PROMPT` in `lib/vote-link-extractor.ts`, with variables `{{subject}}`, `{{body}}`, `{{links}}`; structured output: `VOTE_LINK_SCHEMA` |
| `vote-link-ai` | Boolean flag | Kill switch for that model fallback (emails in IDFA's usual template never reach it) |

### Voting links by email (optional)

IDFA emails a single-use Audience Award voting link per scanned ticket. The app can receive those emails through [Postmark](https://postmarkapp.com) inbound and show each link to the holder of a ticket.

1. Run `migrations/006-vote-links.sql`.
2. Create a Postmark server. On its inbound stream, copy the inbound address into `INBOUND_EMAIL_ADDRESS` and set the webhook to `https://postmark:<INBOUND_WEBHOOK_SECRET>@<your-app>/api/inbound/email`.
3. Each user then finds a private forwarding address on the **Crew** page, with the Gmail steps: add it as a forwarding address, confirm it with the button that appears on the Crew page, and add a filter (`from:noreply@mailgun.idfa.nl "Cast your vote"`) that forwards to it.

To try the webhook locally, post the sample mail with your own token as `MailboxHash`:

```bash
curl -u postmark:$INBOUND_WEBHOOK_SECRET -H 'Content-Type: application/json' -d @scripts/fixtures/vote-email.json http://localhost:3000/api/inbound/email
```

## Deploying

The app is deployed on Vercel from `main`. Set the environment variables in the Vercel project and add the production callback URL to the Google OAuth client.

## Maintenance scripts

Run with `npm run <name>`; they read `.env.local`.

- `backfill-qr-hashes` adds QR hashes to tickets uploaded before migration 002, for duplicate detection
- `backfill-festival-links` finds IDFA page links for tickets that don't have one, with the same lookup as uploads (pass `-- --dry-run` to only print them)
- `optimize-backgrounds`, `generate-favicons` regenerate images in `public/`

For how the code is organized, see [ARCHITECTURE.md](ARCHITECTURE.md).
