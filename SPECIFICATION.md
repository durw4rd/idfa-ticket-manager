# IDFA Ticket Manager - Specification & Architecture

## Overview

A Next.js web application for managing IDFA (International Documentary Film Festival Amsterdam) film festival tickets. The app helps users organize multiple PDF tickets across different purchases by extracting key information and providing an easy-to-use interface for accessing tickets and QR codes.

## Goals

- Simplify ticket management across multiple PDF files
- Extract and display key screening information automatically
- Provide quick access to QR codes for entry
- Create an organized overview of all screenings

## Core Features

### 1. PDF Upload & Processing
- Upload PDF ticket files (single or multiple)
- **Important**: PDFs can be single-page (one ticket) or multi-page (multiple tickets)
  - **Single-page PDF**: One ticket per PDF file
  - **Multi-page PDF**: Each page = one separate ticket (e.g., purchased multiple screenings in one transaction)
- **PDF Splitting**: Multi-page PDFs are automatically split into individual pages
- **Per-page Processing**: Each page is processed separately to extract:
  - **Act**: Movie/film title (e.g., "Cutting Through Rocks")
  - **Location**: Cinema/venue name (e.g., "Kriterion 1")
  - **Date**: Screening date in DD-MM-YYYY format (e.g., "15-11-2025")
  - **Start**: Screening time in HH:MM AM/PM format (e.g., "06:45 PM")
  - **QR Code**: Unique QR code image from the ticket
- Automatically group tickets: If Act, Date, and Start time match, treat them as multiple tickets for the same screening
- Store extracted data for later access
- Show progress when processing multi-page PDFs (e.g., "Processing page 1 of 3...")

### 2. Screening Overview
- Display all unique screenings in a list/grid view
- Group multiple tickets for the same screening together
- Show key details: date, time, movie (Act), location
- Display ticket count badge (e.g., "2 tickets" if you have 2 tickets for that screening)
- Filter/sort by date, movie, or location
- Quick access to screening details

### 3. Screening Detail View
- Display full screening information (Act, Location, Date, Start)
- **Show all QR codes** for that screening (one per ticket)
- If multiple tickets exist, display all QR codes clearly labeled (e.g., "Ticket 1", "Ticket 2")
- Large, scannable QR code display with full-screen option
- Easy navigation between screenings

## Technical Architecture

### Stack Recommendations

#### Frontend
- **Next.js 14+** (App Router) - Modern React framework with excellent Vercel integration
- **TypeScript** - Type safety and better developer experience
- **Tailwind CSS** - Utility-first CSS for rapid UI development
- **React PDF** or **PDF.js** - For PDF rendering and QR code extraction

#### Backend & Processing
- **Next.js API Routes** - Serverless functions for file uploads and processing
- **OpenAI API** (GPT-4 Vision) - Extract structured data from PDFs
- **pdf-parse** or **pdfjs-dist** - PDF text extraction (fallback/alternative)
- **qrcode-reader** or **jsQR** - QR code detection from PDF images

#### Database
- **Vercel Postgres** (Recommended) - Native Vercel integration, easy setup
  - Alternative: **Supabase** (Postgres with built-in storage)
  - Alternative: **Google Sheets API** (if preferred for simplicity)

#### Storage
- **Vercel Blob Storage** - For storing PDF files and QR code images
  - Alternative: **AWS S3** or **Cloudinary**
  - Alternative: Store in database as base64 (not recommended for production)

### Data Model

#### Ticket Schema (Individual Tickets)
Each PDF ticket is stored as a separate ticket record:

```typescript
interface Ticket {
  id: string;              // UUID or auto-generated
  act: string;             // Movie/film title (e.g., "Cutting Through Rocks")
  location: string;        // Cinema/venue name (e.g., "Kriterion 1")
  date: string;            // Date in DD-MM-YYYY format (e.g., "15-11-2025")
  start: string;           // Time in HH:MM AM/PM format (e.g., "06:45 PM")
  qrCodeUrl: string;       // URL to QR code image
  pdfUrl: string;          // URL to original PDF
  transactionId?: string;  // Optional: transaction ID from ticket
  createdAt: Date;         // When ticket was uploaded
}
```

#### Screening Grouping Logic
Screenings are identified by the combination of:
- `act` (movie title)
- `date` (screening date)
- `start` (start time)

Multiple tickets with the same `act + date + start` belong to the same screening.

#### Screening View (Aggregated)
For UI display, screenings are aggregated:

```typescript
interface Screening {
  id: string;              // Composite key: act-date-start
  act: string;             // Movie title
  location: string;        // Cinema name (should be same for all tickets)
  date: string;            // Date in DD-MM-YYYY format
  start: string;           // Time in HH:MM AM/PM format
  dateTime: Date;          // Parsed date+time for sorting/filtering
  tickets: Ticket[];       // Array of all tickets for this screening
  ticketCount: number;     // Number of tickets (tickets.length)
}
```

### AI Integration Strategy

#### Primary Approach: OpenAI GPT-4 Vision
1. **Split multi-page PDFs**: If PDF has multiple pages, split into individual page PDFs
2. **Process each page separately**: For each page (whether from single or multi-page PDF):
   - Convert PDF page to image (using pdfjs-dist)
   - Send image to GPT-4 Vision API with a structured prompt
   - Request JSON response with extracted fields
   - Parse and validate the response
3. Aggregate results: Collect all extracted tickets from all pages

**Prompt Template:**
```
You are analyzing an IDFA (International Documentary Film Festival Amsterdam) ticket PDF. 
Extract the following information and return it as JSON:

{
  "act": "The exact movie/film title as shown (e.g., 'Cutting Through Rocks')",
  "location": "The cinema or venue name (e.g., 'Kriterion 1')",
  "date": "The date in DD-MM-YYYY format (e.g., '15-11-2025')",
  "start": "The start time in HH:MM AM/PM format (e.g., '06:45 PM')",
  "qrCodePosition": {
    "description": "Describe the approximate position of the QR code on the page (e.g., 'top left, large square below the IDFA logo')"
  }
}

Important notes:
- Look for fields labeled "Act", "Location", "Date", and "Start"
- The date format is DD-MM-YYYY (day-month-year)
- The time format uses 12-hour clock with AM/PM
- Each PAGE represents exactly ONE ticket (you are analyzing a single page)
- Find the QR code (usually a large square code) and describe its position

Return ONLY valid JSON, no additional text or markdown formatting.
```

#### Fallback Approach: OCR + Pattern Matching
- Use **pdf-parse** for text extraction
- Use regex patterns to find dates, titles, locations
- Use image processing to locate and extract QR codes

### Architecture Diagram

```
┌─────────────────┐
│   Next.js App   │
│  (Frontend UI)  │
└────────┬────────┘
         │
         ├──► Upload PDF ──┐
         │                  │
         │                  ▼
         │         ┌─────────────────┐
         │         │  API Route      │
         │         │  /api/upload    │
         │         └────────┬────────┘
         │                  │
         │                  ├──► Store PDF ──► Vercel Blob
         │                  │
         │                  ├──► Split Multi-page PDF ──► Individual Pages
         │                  │
         │                  ├──► For Each Page:
         │                  │    ├──► Convert Page to Image
         │                  │    ├──► Send to OpenAI ──► Extract Data
         │                  │    ├──► Extract QR Code
         │                  │    └──► Save Ticket to DB ──► Vercel Postgres
         │
         ├──► List Screenings ──► API Route ──► Database
         │
         └──► View Ticket ──► Display QR Code & Details
```

## Implementation Guide

### Phase 1: Project Setup (1-2 hours)

#### Step 1: Initialize Next.js Project
```bash
npx create-next-app@latest idfa-manager --typescript --tailwind --app
cd idfa-manager
```

#### Step 2: Install Core Dependencies
```bash
# PDF processing
npm install pdfjs-dist pdf-parse pdf-lib
npm install -D @types/pdf-parse

# QR code handling
npm install jsqr qrcode

# Image processing (if needed)
npm install sharp

# OpenAI SDK
npm install openai

# Database (Vercel Postgres)
npm install @vercel/postgres

# File upload handling
npm install formidable
npm install -D @types/formidable
```

**Note**: `pdf-lib` is used for splitting multi-page PDFs into individual pages.

#### Step 3: Set Up Environment Variables
Create `.env.local`:
```env
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=your_vercel_postgres_url_here
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
```

#### Step 4: Set Up Vercel Services
1. Create a Vercel account (if not already)
2. Install Vercel CLI: `npm i -g vercel`
3. Link project: `vercel link`
4. Create Postgres database in Vercel dashboard
5. Create Blob storage in Vercel dashboard
6. Copy connection strings to `.env.local`

### Phase 2: Database Setup (1 hour)

#### Step 1: Create Database Schema
Create SQL migration file or run in Vercel dashboard:

```sql
-- Tickets table: Each PDF = one ticket record
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  date VARCHAR(10) NOT NULL,          -- DD-MM-YYYY format
  start VARCHAR(10) NOT NULL,         -- HH:MM AM/PM format
  qr_code_url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  transaction_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient screening grouping and queries
CREATE INDEX idx_screening_key ON tickets(act, date, start);
CREATE INDEX idx_date ON tickets(date);
CREATE INDEX idx_act ON tickets(act);
CREATE INDEX idx_location ON tickets(location);

-- Computed index for sorting: parse date and start into timestamp
-- Note: Application layer will handle date/time parsing for sorting
```

#### Step 2: Create Database Utility Functions
Create `lib/db.ts` for database operations:

**Ticket Operations:**
- `createTicket(ticket: Ticket)` - Store a new ticket
- `getAllTickets()` - Get all tickets
- `getTicketById(id: string)` - Get single ticket
- `deleteTicket(id: string)` - Delete a ticket

**Screening Aggregation:**
- `getAllScreenings()` - Group tickets by act+date+start, return aggregated screenings
- `getScreeningByKey(act: string, date: string, start: string)` - Get all tickets for a specific screening
- `getScreeningsByDate(dateFrom?: Date, dateTo?: Date)` - Filter screenings by date range

**Helper Functions:**
- `parseTicketDateTime(date: string, start: string): Date` - Parse DD-MM-YYYY and HH:MM AM/PM to Date object
- `groupTicketsIntoScreenings(tickets: Ticket[]): Screening[]` - Group tickets logic

### Phase 3: PDF Processing Pipeline (5-7 hours)

#### Step 1: Create PDF Upload API Route
Create `app/api/upload/route.ts`:
- Handle multipart form data
- Validate file type (PDF only)
- Upload PDF to Vercel Blob
- Return PDF URL

#### Step 2: Create PDF Processing API Route
Create `app/api/process-pdf/route.ts`:
- Accept PDF URL or file buffer
- **Split multi-page PDF**: If PDF has multiple pages, split into individual page PDFs using `pdf-lib`
- **Process each page separately**:
  - Convert PDF page to image
  - Use OpenAI GPT-4 Vision to extract data (act, location, date, start)
  - Extract QR code from images (using position description from AI)
  - Store QR code image to Vercel Blob
  - **Check if screening already exists** (act+date+start combination)
  - Save ticket to database (create new ticket record)
- Aggregate results: Return array of all processed tickets with their IDs and screening info
- Handle errors gracefully: If one page fails, continue processing remaining pages
- Return summary: Total pages processed, successful tickets, any errors

#### Step 3: Implement PDF Splitting Utility
Create `lib/pdf-splitter.ts`:
- Function to split multi-page PDF into individual page PDFs
- Accept PDF buffer or URL
- Return array of single-page PDF buffers
- Handle edge case: Single-page PDFs return array with one element

#### Step 4: Implement OpenAI Integration
Create `lib/openai-processor.ts`:
- Function to convert single PDF page to image
- Function to call GPT-4 Vision API (processes one page at a time)
- Function to parse and validate response
- Error handling and retries

#### Step 5: Implement QR Code Extraction
Create `lib/qr-extractor.ts`:
- Use AI response `qrCodePosition` description to locate QR code
- Alternatively: Detect QR code patterns in PDF page images using image processing
- Extract QR code region from PDF page images
- Use `jsQR` or similar library to decode QR codes (optional validation)
- Convert QR code to image format (PNG/JPG) for display
- Store QR code image to Vercel Blob
- Return QR code URL

### Phase 4: Frontend UI Development (7-9 hours)

#### Step 1: Create Upload Component
Create `components/UploadTicket.tsx`:
- Drag-and-drop file upload
- Multiple file support
- Upload progress indicator
- **Processing status**: Show progress when processing multi-page PDFs
  - Display: "Processing PDF: page X of Y"
  - Show total number of tickets being extracted
- Error handling
- Success summary: Show how many tickets were extracted from each PDF

#### Step 2: Create Screening Overview Page
Create `app/screenings/page.tsx`:
- List/grid view of all **unique screenings** (grouped by act+date+start)
- Show ticket count badge if multiple tickets exist for a screening
- Display: Act, Location, Date, Start time
- Filter by date, movie (Act), location
- Sort functionality (by date/time, alphabetically by Act, etc.)
- Card-based layout with key info
- Link to detail view
- Visual indicator for screenings with multiple tickets

#### Step 3: Create Screening Detail Page
Create `app/screenings/[id]/page.tsx`:
- `id` parameter is a composite key: `act|date|start` (URL-encoded)
- Display full screening information: Act, Location, Date, Start
- **Show ALL QR codes** for this screening (one per ticket)
- If multiple tickets: Display QR codes side-by-side or in a grid
- Each QR code should be clearly labeled ("Ticket 1", "Ticket 2", etc.)
- Large, scannable QR code display with full-screen/modal option
- Option to delete individual tickets or all tickets for a screening
- Navigation to previous/next screening

#### Step 4: Create Reusable Components
- `components/ScreeningCard.tsx` - Card for overview (shows ticket count badge)
- `components/QRCodeDisplay.tsx` - QR code component (reusable for single QR)
- `components/QRCodeGrid.tsx` - Grid component to display multiple QR codes
- `components/DateFilter.tsx` - Filter controls
- `components/LoadingSpinner.tsx` - Loading states
- `components/TicketCountBadge.tsx` - Badge showing number of tickets (e.g., "2 tickets")

### Phase 5: Integration & Testing (2-3 hours)

#### Step 1: Connect Upload to Processing
- Wire up upload component to API
- Show processing status
- After upload: Check if screening already exists
- If new screening: Redirect to new screening detail page
- If existing screening: Show message "Added ticket to existing screening" and redirect to that screening
- Display ticket count after grouping

#### Step 2: Add Error Handling
- Validate extracted data
- Show user-friendly error messages
- Allow manual editing of extracted data

#### Step 3: Add Manual Override
- Allow users to edit extracted information
- Manual QR code upload option
- Add notes/reminders

### Phase 6: Polish & Deploy (2-3 hours)

#### Step 1: Styling & UX Improvements
- Responsive design (mobile-friendly)
- Loading states
- Success/error notifications
- Empty states

#### Step 2: Add Helper Features
- Search functionality
- Calendar view option
- Export functionality (optional)
- Delete screenings

#### Step 3: Deploy to Vercel
```bash
vercel --prod
```

## File Structure

```
idfa-manager/
├── app/
│   ├── api/
│   │   ├── upload/
│   │   │   └── route.ts
│   │   ├── process-pdf/
│   │   │   └── route.ts
│   │   └── screenings/
│   │       └── route.ts
│   ├── screenings/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── UploadTicket.tsx
│   ├── ScreeningCard.tsx
│   ├── QRCodeDisplay.tsx
│   ├── DateFilter.tsx
│   └── LoadingSpinner.tsx
├── lib/
│   ├── db.ts
│   ├── pdf-splitter.ts      // Split multi-page PDFs into individual pages
│   ├── openai-processor.ts
│   ├── qr-extractor.ts
│   ├── pdf-utils.ts         // PDF page to image conversion
│   ├── date-parser.ts       // Parse DD-MM-YYYY and HH:MM AM/PM formats
│   ├── screening-grouping.ts // Logic to group tickets into screenings
│   └── types.ts
├── public/
├── .env.local
├── next.config.js
├── package.json
└── SPECIFICATION.md
```

## Cost Considerations

### OpenAI API Costs
- GPT-4 Vision: ~$0.01-0.03 per PDF (depending on pages)
- For 15 PDFs: ~$0.15-0.45 one-time cost
- Very reasonable for personal use

### Vercel Costs
- Hobby plan (free) should be sufficient for personal use
- Postgres: Included in hobby plan (limited storage)
- Blob storage: Pay-as-you-go, minimal cost for PDFs

## Alternative Approaches

### Without AI (Pattern Matching)
- Pros: No API costs, faster processing
- Cons: Less reliable, requires ticket format consistency
- Use: Regex patterns, OCR libraries (Tesseract.js)

### Using Google Sheets
- Pros: Familiar interface, no database setup
- Cons: API rate limits, less query flexibility
- Implementation: Use `googleapis` npm package

## Next Steps for Enhancement

1. **Calendar Integration**: Export to Google Calendar/iCal
2. **Notifications**: Remind before screenings
3. **Sharing**: Share tickets with partner
4. **Ticket Validation**: Verify QR codes are valid
5. **Mobile App**: PWA or React Native version
6. **Offline Support**: Cache tickets locally

## Testing Strategy

### Manual Testing Checklist
- [ ] Upload single-page PDF ticket
- [ ] Upload multi-page PDF (2+ pages, each with different tickets)
- [ ] Upload multiple single-page PDFs
- [ ] Upload mix of single-page and multi-page PDFs
- [ ] Verify PDF splitting works correctly (multi-page PDFs split into individual pages)
- [ ] Verify each page from multi-page PDF is processed separately
- [ ] Upload multiple PDF tickets for the same screening
- [ ] Upload tickets for different screenings
- [ ] Verify data extraction accuracy (Act, Location, Date, Start)
- [ ] Verify tickets are correctly grouped by act+date+start
- [ ] Test QR code display and scanning (single and multiple)
- [ ] Test that all QR codes show for screenings with multiple tickets
- [ ] Test filtering and sorting
- [ ] Test date parsing (DD-MM-YYYY format)
- [ ] Test time parsing (HH:MM AM/PM format)
- [ ] Test processing progress indicators for multi-page PDFs
- [ ] Test on mobile devices
- [ ] Test with various PDF formats

### Edge Cases to Handle
- Malformed PDFs
- PDFs without QR codes
- Unclear or missing information (Act, Location, Date, Start)
- Date/time format variations (though IDFA tickets should be consistent)
- Tickets with same act+date+start but different locations (should not happen, but handle gracefully)
- Very large PDF files
- Multi-page PDFs with many pages (10+ pages - may need pagination or batch processing)
- Partially corrupted multi-page PDFs (some pages process, others fail)
- Single-page PDFs (should not trigger splitting logic unnecessarily)
- Duplicate ticket uploads (same PDF uploaded twice - should detect or allow)
- Processing errors for individual pages in multi-page PDF (continue with remaining pages)

## Resources & Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Important Implementation Notes

### Multi-page PDF Handling
- **PDF Splitting**: Use `pdf-lib` to split multi-page PDFs before processing
- **Per-page Processing**: Each page must be processed separately as a distinct ticket
- **Progress Tracking**: For multi-page PDFs, show progress (e.g., "Processing page 2 of 5")
- **Error Resilience**: If one page fails to process, continue with remaining pages and report errors at the end
- **Storage**: Consider storing the original multi-page PDF URL alongside individual ticket records for reference
- **Single-page Optimization**: For single-page PDFs, avoid unnecessary splitting overhead

### Date and Time Parsing
- **Date Format**: DD-MM-YYYY (e.g., "15-11-2025" = November 15, 2025)
- **Time Format**: HH:MM AM/PM (e.g., "06:45 PM" = 18:45)
- Create helper function `parseTicketDateTime(date: string, start: string): Date` to combine these into a JavaScript Date object for sorting/filtering
- Handle timezone appropriately (IDFA is in Amsterdam, UTC+1 or UTC+2 depending on DST)

### Screening Grouping Logic
- A screening is uniquely identified by: `act + date + start`
- Two tickets belong to the same screening if all three values match exactly
- When displaying screenings, aggregate all tickets with matching keys
- Location should be the same for all tickets in a screening (but don't use it as part of the key, just validate)

### QR Code Handling
- Each ticket has exactly one QR code
- When multiple tickets exist for a screening, display all QR codes
- Consider a grid layout for 2-4 QR codes, or a vertical list for more
- Make QR codes large enough to be easily scannable (minimum 200x200px recommended)
- Add full-screen/modal view for individual QR codes

## Estimated Total Development Time

- **Beginner**: 24-30 hours
- **Moderate**: 19-24 hours
- **Advanced**: 14-19 hours

This includes setup, development, testing, and deployment. Time estimates account for:
- PDF splitting functionality for multi-page PDFs
- Grouping tickets into screenings
- Displaying multiple QR codes per screening
- Progress tracking for multi-page processing
