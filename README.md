# IDFA Ticket Manager

A Next.js application for managing IDFA film festival tickets. Upload PDF tickets, automatically extract screening information using AI, and access QR codes for easy entry.

## Features

- Google OAuth authentication with email whitelist
- Upload single or multi-page PDF tickets
- AI-powered extraction of ticket information (movie title, date, time, location)
- Automatic grouping of multiple tickets for the same screening
- Quick access to QR codes with fullscreen mode for easy scanning
- AI-powered automatic detection of a link to the movie details page on the main IDFA website
- Directions to screening venues via Google Maps
- Venue-specific background styling for screening cards
- Date-based styling (highlights today's screenings, dims past screenings)
- Visual indicators for date nights (couple icon for 2-ticket screenings)
- User movie ratings (1-10 scale) with optional comments
- Average movie ratings displayed on screening cards

## Prerequisites

- Node.js 22+ (required for `pdfjs-dist` compatibility)
- npm
- Vercel account (for Postgres and Blob storage)
- OpenAI API key
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

# AI Processing
OPENAI_API_KEY=your-openai-api-key
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

**OPENAI_API_KEY**: From OpenAI platform (required for PDF ticket data extraction)

**NEXTAUTH_URL**: Auto-detected based on environment:
- Development: `http://localhost:3000`
- Production on Vercel: Uses `VERCEL_URL` automatically
- Can be set manually if needed

3. Set up database:

Run this SQL in your Postgres database:

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

4. Configure email whitelist:

Update the email whitelist in `lib/auth.ts` (currently hardcoded):
```typescript
const ALLOWED_EMAILS = [
  'your-email@gmail.com',
  // Add more emails as needed
];
```

5. Run development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
│   │   ├── ratings/              # Movie rating endpoints
│   │   └── screenings/           # Screenings API
│   ├── login/                    # Login page
│   ├── screenings/               # Screening pages
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
│   ├── openai-processor.ts       # AI extraction
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
- OpenAI GPT-4o - PDF data extraction
- pdf-lib - PDF manipulation
- pdfjs-dist - PDF rendering (client-side)
- jsQR - QR code detection
- sharp - Image processing
- lucide-react - Icon library

## License

MIT
