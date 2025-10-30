# IDFA Ticket Manager

A Next.js application for managing IDFA (International Documentary Film Festival Amsterdam) film festival tickets. Upload PDF tickets, automatically extract screening information, and easily access QR codes for entry.

## Features

- 📄 Upload single or multi-page PDF tickets
- 🤖 AI-powered extraction of ticket information (movie title, date, time, location)
- 📱 Quick access to QR codes for easy entry
- 🎬 Organized screening overview grouped by film and time
- 🔄 Automatic grouping of multiple tickets for the same screening

## Setup

### Prerequisites

- Node.js 18+ and npm
- Vercel account (for Postgres and Blob storage)
- OpenAI API key

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up storage and database:
   
   **Blob Storage (for PDFs and QR codes):**
   - In Vercel dashboard, go to "Browse Storage"
   - Create a **Blob** storage instance
   - Copy the `BLOB_READ_WRITE_TOKEN` to your `.env.local`

   **Postgres Database:**
   - Recommended: Create a **Neon** database (serverless Postgres) from the Marketplace
   - Alternative: Use **Supabase** (also Postgres-compatible)
   - Copy the Postgres connection string to your `.env.local` as `DATABASE_URL`
   - The `@vercel/postgres` package works with both Neon and Supabase

3. Set up environment variables:
   Copy `.env.local.example` to `.env.local` and fill in your values:
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   DATABASE_URL=your_neon_or_supabase_postgres_connection_string
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
   ```

4. Initialize database:
Run this SQL in your Postgres database (Neon or Supabase):
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
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_screening_key ON tickets(act, date, start);
CREATE INDEX idx_date ON tickets(date);
CREATE INDEX idx_act ON tickets(act);
CREATE INDEX idx_location ON tickets(location);
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

Deploy to Vercel:
```bash
vercel --prod
```

Make sure to set environment variables in Vercel dashboard as well.

## Project Structure

```
idfa-manager/
├── app/
│   ├── api/              # API routes
│   ├── screenings/       # Screening pages
│   ├── upload/           # Upload page
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/           # React components
├── lib/                  # Utilities and helpers
│   ├── db.ts            # Database operations
│   ├── pdf-splitter.ts  # PDF splitting
│   ├── openai-processor.ts # AI extraction
│   └── qr-extractor.ts  # QR code extraction
└── SPECIFICATION.md      # Full specification
```

## Technology Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Vercel Postgres** - Database
- **Vercel Blob** - File storage
- **OpenAI GPT-4** - PDF data extraction
- **pdf-lib** - PDF manipulation
- **jsQR** - QR code detection

## License

MIT

