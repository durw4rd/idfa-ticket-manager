# Movie Rating Feature - Implementation Plan

## Overview
Add the ability for users to rate movies on a scale of 1-10, with ratings stored separately for each user in the database.

## Database Schema

### 1. Create `ratings` table
```sql
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

**Notes:**
- Using `user_email` instead of `user_id` for consistency (NextAuth provides email reliably)
- `UNIQUE(user_email, act)` ensures one rating per user per movie
- `CHECK` constraint enforces 1-10 rating range at database level
- `comment` column is optional (TEXT, nullable) for user comments
- Indexes optimize queries for user ratings and movie ratings

## Backend Implementation

### 2. Update TypeScript Types (`lib/types.ts`)
```typescript
export interface Rating {
  id: string;
  userEmail: string;
  act: string;
  rating: number; // 1-10
  comment?: string | null; // Optional user comment
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Create Database Functions (`lib/db.ts`)
Add functions:
- `getRating(userEmail: string, act: string): Promise<Rating | null>` - Get user's rating for a movie
- `getRatingsByMovie(act: string): Promise<Rating[]>` - Get all ratings for a movie (for aggregate stats)
- `getAverageRating(act: string): Promise<{ average: number; count: number } | null>` - Get average rating and count for a movie
- `upsertRating(userEmail: string, act: string, rating: number, comment?: string | null): Promise<Rating>` - Create or update rating with optional comment

**Implementation notes:**
- Use `UPSERT` (INSERT ... ON CONFLICT ... DO UPDATE) for efficient create/update
- Update `updated_at` timestamp when rating changes
- `getAverageRating` uses SQL `AVG()` and `COUNT()` functions
- Comment can be null/empty (optional field)

### 4. Create API Endpoints

#### `/app/api/ratings/route.ts`
- **GET**: Get current user's rating for a specific movie
  - Query params: `act` (movie title)
  - Returns: `{ rating: number | null }`
  
- **POST/PUT**: Submit or update rating
  - Body: `{ act: string, rating: number, comment?: string }`
  - Validates rating is 1-10
  - Validates comment length (optional, max 500 characters recommended)
  - Returns: `{ success: true, rating: Rating }`
  
- **GET with aggregate**: Optional endpoint for aggregate stats
  - Query params: `act` and `aggregate=true`
  - Returns: `{ average: number, count: number }`

#### `/app/api/ratings/[act]/route.ts` (Alternative approach)
- **GET**: Get rating for current user and specific movie
- **POST**: Create/update rating for current user and specific movie

**Recommended: Use `/app/api/ratings/route.ts` with query params for simplicity**

### 5. Authentication
- All rating endpoints require authentication (use `requireAuth()` helper)
- Extract `user.email` from session for database operations

## Frontend Implementation

### 6. Create Rating Component (`components/MovieRating.tsx`)

**Features:**
- Display current user's rating (if exists)
- Clickable star buttons (1-10) for rating selection
- Selected state visual feedback (filled stars up to selected rating)
- Optional collapsible comment section
- Submit/update rating button
- Loading states
- Error handling

**UI Design:**
- **Star Rating**: 10 clickable star buttons in a row
  - Empty star outline for unselected ratings
  - Filled star for selected ratings (all stars up to and including selected number)
  - Hover state for better UX
  - Clicking a star sets rating to that number (1-10)
- **Comment Section**: Collapsible/expandable textarea
  - Label: "Add a comment (optional)"
  - Expandable button: "Add Comment" / "Hide Comment"
  - Textarea with character limit (500 chars recommended)
  - Show character count
- **Submit Button**: "Save Rating" (or auto-save on rating change)
- **Current Rating Display**: Show existing rating and comment if available

**Component Props:**
```typescript
interface MovieRatingProps {
  movieTitle: string;
  initialRating?: Rating | null; // Full rating object including comment
  onRatingChange?: (rating: number, comment?: string) => void;
}
```

**Component Structure:**
```
<MovieRating>
  <StarButtons /> (1-10 clickable stars)
  <CollapsibleComment /> (expandable textarea)
  <SubmitButton />
  <CurrentRatingDisplay /> (if rating exists)
</MovieRating>
```

### 7. Add to Screening Detail Page (`app/screenings/[id]/page.tsx`)

**Placement:**
- Add rating component at the bottom of the page, below the QR code(s) section
- Should be visible and accessible
- Add section header: "Rate this movie" or similar

**Implementation:**
- Fetch current user's rating for the movie when loading the screening details page
- Use `getRating(userEmail, act)` to get existing rating
- Pass full rating object (including comment) to `MovieRating` component
- Handle rating updates optimistically
- Refresh page or update component state after successful submission

**Layout:**
```
<QR Codes Section>
  ...existing QR code display...

<Rating Section>
  <h2>Rate this movie</h2>
  <MovieRating 
    movieTitle={screening.act}
    initialRating={userRating}
  />
</Rating Section>
```

### 8. Add Average Rating to Screening Cards (`app/screenings/page.tsx`)

**Show aggregate stats on cards:**
- Display minimalistic average rating indicator
- Show average rating (e.g., "8.5") and optionally count (e.g., "12 ratings")
- Place near movie title or at bottom of card
- Use subtle styling to maintain clean design

**Implementation:**
- Fetch average rating for each movie when loading screenings page
- Use `getAverageRating(act)` for each unique movie
- Cache or batch queries for performance (consider creating a batch endpoint)
- Display format: Star icon + number (e.g., "★ 8.5") or "8.5/10 (12)"
- Only show if ratings exist (don't show "0" or empty state)

**UI Placement Options:**
- Option A: Next to movie title (small text, subtle)
- Option B: Bottom of card, below location/time (recommended)
- Option C: As a badge/pill in corner

**Recommended:** Option B - Small text at bottom: "★ 8.5 (12 ratings)" in gray text

## File Structure

```
lib/
  ├── db.ts                    # Add rating database functions
  ├── types.ts                 # Add Rating interface

app/api/ratings/
  └── route.ts                 # GET/POST rating endpoints

components/
  └── MovieRating.tsx          # Rating input/display component

app/screenings/[id]/
  └── page.tsx                 # Add MovieRating component
```

## Implementation Steps

### Phase 1: Database & Backend (2-3 hours)
1. ✅ Create database migration SQL
2. ✅ Add `Rating` interface to `lib/types.ts`
3. ✅ Implement rating database functions in `lib/db.ts`
4. ✅ Create API endpoint `/app/api/ratings/route.ts`
5. ✅ Test API endpoints with Postman/curl

### Phase 2: Frontend Component (3-4 hours)
6. ✅ Create `MovieRating` component
7. ✅ Implement clickable star buttons (1-10) with custom styling
8. ✅ Add collapsible comment section with textarea
9. ✅ Add API calls (fetch current rating, submit/update with comment)
10. ✅ Handle loading and error states
11. ✅ Add optimistic updates for better UX
12. ✅ Style stars (filled/empty states, hover effects)

### Phase 3: Integration (2-3 hours)
13. ✅ Integrate `MovieRating` into screening detail page (below QR codes)
14. ✅ Fetch and display user's rating on page load
15. ✅ Add average rating display to screening cards
16. ✅ Implement `getAverageRating` function and batch fetching
17. ✅ Style card rating indicator (minimalistic)
18. ✅ Test full user flow (rating, commenting, card display)

### Phase 4: Polish (1-2 hours)
19. ⏭️ Add ability to delete rating
20. ⏭️ Improve mobile responsiveness
21. ⏭️ Add animations/transitions for better UX
22. ⏭️ Error handling edge cases

## UI/UX Considerations

### Rating Input Design (Star Buttons)
- **10 clickable stars** arranged horizontally
- Stars are custom-styled SVG icons or Lucide React star icons
- Visual states:
  - **Unselected**: Outline/empty star (gray)
  - **Selected**: Filled star (yellow/gold or app accent color)
  - **Hover**: Slight scale or color change
- Click behavior: Clicking star #N sets rating to N (fills stars 1-N)
- Size: Large enough for mobile taps (~32-40px per star)
- Spacing: Comfortable gap between stars for mobile

### Comment Section
- **Collapsible**: Hidden by default, expandable on click
- Button: "Add a comment (optional)" or "Write a comment"
- When expanded: Shows textarea
- Textarea:
  - Placeholder: "Share your thoughts..."
  - Max length: 500 characters
  - Character counter: "X/500 characters"
  - Auto-resize or fixed height (3-4 lines)
- If comment exists: Show existing comment, allow editing

### Visual Hierarchy
- Rating component placed at bottom of detail page (below QR codes)
- Clear section header: "Rate this movie" (h2 or h3)
- Stars section prominent, comment section subtle/collapsible
- Use app's existing color scheme (black, white, gray, yellow for stars)
- Success feedback: Brief toast or inline message "Rating saved!"

### Mobile Considerations
- Stars should be touch-friendly (min 32px tap target)
- Horizontal scroll if needed, or wrap stars on very small screens
- Comment textarea should be full-width on mobile
- Collapsible comment helps keep UI clean on mobile

### Card Rating Indicator
- Minimalistic design: Small star icon + number
- Format: "★ 8.5" or "8.5/10"
- Optional: "(12 ratings)" in smaller, lighter text
- Color: Gray text to match card info styling
- Placement: Bottom of card, right-aligned or centered

## Edge Cases to Handle

1. **User not authenticated**: Don't show rating component (shouldn't happen due to middleware)
2. **Multiple screenings for same movie**: Ratings are per movie title (act), not per screening
3. **Rating update**: Show confirmation or auto-save with visual feedback
4. **API errors**: Display user-friendly error messages
5. **Network failures**: Retry mechanism or offline indicator

## Testing Checklist

- [ ] Can submit a new rating with stars (1-10)
- [ ] Can submit a rating with a comment
- [ ] Can submit a rating without a comment
- [ ] Can update an existing rating
- [ ] Can update an existing comment
- [ ] Can add a comment to an existing rating
- [ ] Can remove a comment from a rating
- [ ] Rating is validated (1-10 range)
- [ ] Comment length is validated (max 500 chars)
- [ ] Rating persists after page refresh
- [ ] Comment persists after page refresh
- [ ] Collapsible comment section works (expand/collapse)
- [ ] Different users can rate same movie independently
- [ ] Same user cannot have multiple ratings for same movie
- [ ] Average rating displays correctly on screening cards
- [ ] Rating count displays correctly on screening cards
- [ ] Cards without ratings don't show rating indicator
- [ ] Star buttons are clickable and responsive
- [ ] Star visual states work correctly (filled/empty/hover)
- [ ] Mobile responsive design works
- [ ] Error handling works correctly
- [ ] Loading states display properly
- [ ] Optimistic updates work correctly

## Future Enhancements (Out of Scope)

- Rating history page for user
- Export ratings to CSV
- Rating comparison between users
- Recommendations based on ratings
- Edit/delete individual comments without changing rating

