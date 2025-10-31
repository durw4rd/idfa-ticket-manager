# Authentication Implementation Plan

## Technology Choice
**NextAuth.js v4.24.13** (stable version)

## Dependencies to Install
```bash
npm install next-auth@4.24.13
```

## Environment Variables (.env.local)
```env
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
```

**Note:** In production (Vercel), set `NEXTAUTH_URL` to your Vercel deployment URL.

## Implementation Steps

### 1. Google Cloud Console Setup
- Create OAuth 2.0 credentials
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and Vercel URL)

### 2. Create Auth API Route
**File:** `app/api/auth/[...nextauth]/route.ts`
- NextAuth configuration
- Google provider setup
- Email whitelist check in `signIn` callback
- JWT session strategy

### 3. Create Auth Utilities
**File:** `lib/auth.ts`
- Export NextAuth config
- Email whitelist: `misa.fasa@gmail.com`, `martina.chylkova@gmail.com`

### 4. Create Middleware
**File:** `middleware.ts`
- Protect routes: `/upload`, `/screenings`, `/api/*`
- Allow `/login` and `/api/auth/*`
- Redirect unauthenticated users to `/login`

### 5. Create Login Page
**File:** `app/login/page.tsx`
- "Sign in with Google" button
- Uses NextAuth `signIn()` function
- Show error if email not whitelisted

### 6. Update Root Layout
**File:** `app/layout.tsx`
- Wrap app with SessionProvider
- Add logout button in header
- Show user email/name when logged in

### 7. Update Home Page
**File:** `app/page.tsx`
- Redirect to `/screenings` if authenticated
- Redirect to `/login` if not authenticated

### 8. Protect API Routes
Update:
- `app/api/upload/route.ts`
- `app/api/process-pdf/route.ts`
- `app/api/screenings/route.ts`

Add session check in each route handler.

### 9. Create Logout Component
**File:** `components/AuthButton.tsx`
- Login/logout button component
- Used in header

## Email Whitelist Implementation
Hardcoded in `lib/auth.ts`:
```typescript
const ALLOWED_EMAILS = [
  'misa.fasa@gmail.com',
  'martina.chylkova@gmail.com'
];
```

## Session Management
**Strategy:** JWT (stored in HTTP-only cookies)
- No database required
- Persistent across browser restarts
- Works seamlessly on Vercel

## File Structure
```
app/
├── api/
│   ├── auth/
│   │   └── [...nextauth]/
│   │       └── route.ts       # NextAuth API handler
│   ├── upload/
│   │   └── route.ts           # Protected
│   ├── process-pdf/
│   │   └── route.ts           # Protected
│   └── screenings/
│       └── route.ts           # Protected
├── login/
│   └── page.tsx               # Login page
├── page.tsx                   # Redirects to /screenings or /login
├── upload/
│   └── page.tsx               # Protected
└── screenings/
    ├── page.tsx               # Protected
    └── [id]/
        └── page.tsx           # Protected

lib/
└── auth.ts                    # NextAuth configuration

middleware.ts                  # Route protection

components/
└── AuthButton.tsx             # Login/logout button
```

## User Flow
1. Anonymous user → Redirected to `/login`
2. Click "Sign in with Google" → Google OAuth flow
3. Email check → Allow if whitelisted, block otherwise
4. Success → Session created, redirect to `/screenings`
5. Subsequent visits → Auto-login via session cookie
6. Logout → Clear session, redirect to `/login`

## Security
- HTTP-only cookies (prevents XSS)
- CSRF protection (built into NextAuth)
- Email whitelist validation on server
- Secure AUTH_SECRET
- HTTPS in production (Vercel)

