# IDFA Ticket Manager

A Next.js application for managing IDFA film festival tickets. Upload PDF tickets, automatically extract screening information using AI, and access QR codes for easy entry.

## Features

- Google OAuth authentication, with access controlled by a LaunchDarkly flag and group invites
- Multiple users with private data; users in the same group share screenings, tickets, and ratings
- Multiple festival years: each year has its own view, past years become a recap with your ratings
- Upload single or multi-page PDF tickets, with a review step to fix anything the AI misread
- Duplicate detection (the same ticket uploaded twice, by you or someone in your group, is skipped)
- AI-powered extraction of ticket information (movie title, date, time, location), with the model and prompt managed in LaunchDarkly AgentControl (OpenAI or Anthropic)
- Automatic grouping of multiple tickets for the same screening
- Quick access to QR codes with fullscreen mode for easy scanning
- AI-powered automatic detection of a link to the movie details page on the main IDFA website
- Directions to screening venues via Google Maps
- Venue-specific background styling for screening cards
- "Up next" card, screenings grouped by day, and Amsterdam-time "today"/"past" styling
- Add a screening to your calendar (.ics), fix ticket details, delete tickets
- QR codes stored privately and only served to signed-in users who can see the ticket
- Visual indicators for date nights (couple icon for 2-ticket screenings)
- User movie ratings (1-10 scale) with optional comments
- Average movie ratings displayed on screening cards

## Prerequisites

- Node.js 22+ (required for `pdfjs-dist` compatibility)
- npm
- Vercel account (for Postgres and Blob storage)
- OpenAI API key (and an Anthropic API key to use Claude models)
- LaunchDarkly account with a project for this app
- Google Cloud Console account (for OAuth)

**Note:** If you use `nvm`, the project includes a `.nvmrc` file. Run `nvm use` in the project directory to switch to the correct Node.js version.

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env.local`:

```env
# Authentication (NextAuth.js)
AUTH_SECRET=your-auth-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
# NEXTAUTH_URL is auto-detected, but can be set manually:
# NEXTAUTH_URL=http://localhost:3000  # for local development

# Database
DATABASE_URL=your-postgres-connection-string

# Storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
PRIVATE_BLOB_READ_WRITE_TOKEN=your-private-vercel-blob-token  # optional but recommended

# AI Processing
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key  # needed when a LaunchDarkly variation serves a Claude model

# LaunchDarkly
LD_SDK_KEY=your-launchdarkly-server-sdk-key
LD_SERVICE_NAME=idfa-manager  # optional, labels AI traces

# Sign-in fallback, used only when LaunchDarkly can't be reached
ALLOWED_EMAILS=you@gmail.com,partner@gmail.com
```

### Environment Variables Details

**AUTH_SECRET**: Generate a secure random string for NextAuth.js session encryption. Generate with: `openssl rand -base64 32`

**GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET**: Obtain from Google Cloud Console:
1. Create a new project or select existing
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL)

**DATABASE_URL**: Postgres connection string from:
- Neon (recommended): Create a Neon database from Vercel Marketplace
- Supabase: Use Postgres connection string
- Vercel Postgres: Use `POSTGRES_URL` instead

**BLOB_READ_WRITE_TOKEN**: From Vercel dashboard:
1. Go to "Storage" → "Browse Storage"
2. Create a Blob storage instance
3. Copy the read/write token

**PRIVATE_BLOB_READ_WRITE_TOKEN**: Read/write token of a second Blob store created with **private** access (Vercel sets access per store). When set, new QR codes and PDFs are stored privately. Move existing files with `npm run migrate-blobs-private` (safe to re-run). Tickets uploaded before migration 002 need `npm run backfill-qr-hashes` for duplicate detection.

**OPENAI_API_KEY**: From OpenAI platform (required for PDF ticket data extraction, and used as the fallback model)

**ANTHROPIC_API_KEY**: From the Anthropic Console. Required only if a LaunchDarkly config variation serves a Claude model.

**LD_SDK_KEY**: Server-side SDK key of your LaunchDarkly environment (Project settings → Environments). `LAUNCHDARKLY_SDK_KEY` is accepted as an alias.

**ALLOWED_EMAILS**: Comma-separated emails allowed to sign in when LaunchDarkly is unreachable. Members of a group (and invited users) can always sign in.

**NEXTAUTH_URL**: Auto-detected based on environment:
- Development: `http://localhost:3000`
- Production on Vercel: Uses `VERCEL_URL` automatically
- Can be set manually if needed

3. Set up database:

For an existing database, run the migrations in `migrations/` in order (`add-festival-link.sql`, then `002-multi-user-multi-year.sql`). `002` assigns existing tickets to one owner and seeds a group; edit the emails in it before running it.

For a new database, run this SQL, then `migrations/002-multi-user-multi-year.sql`:

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  date VARCHAR(10) NOT NULL,
  start VARCHAR(10) NOT NULL,
  qr_code_url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  transaction_id VARCHAR(50),
  festival_link TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_screening_key ON tickets(act, date, start);
CREATE INDEX idx_date ON tickets(date);
CREATE INDEX idx_act ON tickets(act);
CREATE INDEX idx_location ON tickets(location);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email VARCHAR(255) NOT NULL,
  act VARCHAR(255) NOT NULL,  -- Movie title
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  comment TEXT,  -- Optional short comment from user
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_email, act)  -- One rating per user per movie
);

CREATE INDEX idx_ratings_user_email ON ratings(user_email);
CREATE INDEX idx_ratings_act ON ratings(act);
CREATE INDEX idx_ratings_user_act ON ratings(user_email, act);
```

4. Set up LaunchDarkly (see [LaunchDarkly setup](#launchdarkly-setup))

5. Run development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## LaunchDarkly setup

The app uses the LaunchDarkly Node.js AI SDK (`@launchdarkly/ai-server`, beta, versions pinned) with OpenAI and Anthropic handlers. Which provider and model runs is decided by the variation LaunchDarkly serves, so you can switch models without a deploy. If a config is off, missing, or LaunchDarkly is unreachable, the app falls back to the hardcoded OpenAI `gpt-4o` call.

Create these in your LaunchDarkly project:

| Key | Type | Setup |
|---|---|---|
| `ticket-extraction` | AgentControl config, completion mode | System message: `TICKET_EXTRACTION_PROMPT` from `lib/ticket-extractor.ts`. Parameters: temperature 0, max tokens 500. Add one variation per model you want to try (e.g. OpenAI gpt-4o, an Anthropic Claude model). |
| `festival-link-finder` | AgentControl config, completion mode | User message: `FESTIVAL_LINK_PROMPT` from `lib/find-festival-link.ts` (uses `{{movieTitle}}` and `{{festivalYear}}`). Parameters: temperature 0, max tokens 300. |
| `festival-link-ai` | Boolean flag | Kill switch for the AI festival-link lookup. Serve `true` by default. |
| `app-access` | Boolean flag | Who may sign in. Serve `true` to a segment of allowed emails (context kind `user`, key = email), `false` otherwise. |
| `ticket-extraction-corrected` | Numeric custom metric | Sent from the upload review step: `1` when a user had to fix AI-extracted fields, `0` when they were right. Use it to compare model variations. |

AI metrics (tokens, latency, errors) appear on each config's **Monitoring** tab 1–2 minutes after the first call.

## Deployment

### Deploy to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Import project in Vercel:
   - Go to Vercel dashboard
   - Click "New Project"
   - Import your repository
   - Vercel will auto-detect Next.js settings

3. Configure environment variables in Vercel:
   - Go to Project Settings → Environment Variables
   - Add all environment variables from `.env.local`
   - Make sure `NEXTAUTH_URL` matches your production domain (or leave unset to auto-detect)

4. Update Google OAuth redirect URI:
   - Add your production URL to Google Cloud Console authorized redirect URIs:
     `https://your-domain.vercel.app/api/auth/callback/google`

5. Deploy:
   - Vercel will automatically deploy on push to main branch
   - Or use: `vercel --prod`

## Project Structure

```
idfa-manager/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth authentication
│   │   ├── upload/               # PDF upload endpoint
│   │   ├── process-pdf/          # PDF processing endpoint
│   │   ├── groups/               # Sharing groups (create, invite, join, leave)
│   │   ├── ratings/              # Movie rating endpoints
│   │   ├── screenings/           # Screenings API
│   │   └── tickets/[id]/         # Edit/delete a ticket, serve its QR code
│   ├── login/                    # Login page
│   ├── screenings/               # Screening pages (per festival year)
│   ├── settings/                 # Sharing groups page
│   ├── upload/                   # Upload page
│   ├── layout.tsx                # Root layout with auth
│   └── page.tsx                  # Home page (redirects)
├── components/
│   ├── IDFALogo.tsx              # IDFA logo component
│   ├── AuthButton.tsx            # Login/logout button
│   ├── UploadTicket.tsx          # Upload component
│   ├── QRCodeDisplay.tsx         # QR code display with fullscreen
│   ├── FestivalLinkButton.tsx    # Button to view movie description
│   ├── FestivalLinkModal.tsx     # Modal for movie description iframe
│   ├── CoupleIcon.tsx            # Icon for 2-ticket screenings
│   ├── MovieRating.tsx           # Movie rating input/display component
│   ├── AverageRating.tsx         # Component to display average rating
│   ├── AllRatings.tsx            # Component to display all user ratings
│   ├── CollapsibleQRSection.tsx  # Collapsible QR code section component
│   └── Providers.tsx             # NextAuth session provider
├── lib/
│   ├── auth.ts                   # NextAuth configuration
│   ├── auth-helpers.ts           # Auth utility functions
│   ├── db.ts                     # Database operations
│   ├── ticket-extractor.ts       # AI extraction via LaunchDarkly AgentControl
│   ├── launchdarkly.ts           # LaunchDarkly client, flags, and events
│   ├── groups.ts                 # Sharing groups and data visibility
│   ├── storage.ts                # Private/public Blob storage for ticket files
│   ├── dates.ts                  # Amsterdam-time date parsing and formatting
│   ├── qr-extractor.ts           # QR code extraction
│   ├── pdf-client-utils.ts       # Client-side PDF processing
│   ├── pdf-splitter.ts           # PDF page splitting
│   ├── festival-links.ts         # Festival link mapping
│   ├── find-festival-link.ts     # AI-powered festival link detection
│   ├── maps-utils.ts             # Google Maps URL generation
│   ├── venue-backgrounds.ts      # Venue background image mapping
│   └── types.ts                  # TypeScript interfaces
├── public/
│   ├── bcg-*.png                 # Venue background images
│   └── favicon files             # App icons
├── scripts/
│   ├── backfill-festival-links.js  # Backfill script for existing tickets
│   ├── migrate-blobs-private.js    # Move existing files to the private Blob store
│   └── generate-favicons.js        # Favicon generation
├── middleware.ts                 # Route protection
└── types/                        # Additional TypeScript types
```

## Technology Stack

- Next.js 15.5.6 - React framework with App Router
- React 19 - UI library
- TypeScript - Type safety
- Tailwind CSS - Styling
- NextAuth.js v4 - Authentication
- Vercel Postgres / Neon - Database
- Vercel Blob - File storage
- LaunchDarkly AgentControl + Node.js AI SDK - Model and prompt management
- OpenAI / Anthropic - PDF data extraction
- pdf-lib - PDF manipulation
- pdfjs-dist - PDF rendering (client-side)
- jsQR - QR code detection
- sharp - Image processing
- lucide-react - Icon library

## License

MIT
