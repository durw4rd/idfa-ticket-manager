# CLAUDE.md

IDFA Ticket Manager: a Next.js 15 (App Router, React 19, TypeScript, Tailwind 3) app on Vercel for uploading IDFA festival PDF tickets, extracting them with AI, and showing a shared schedule with QR codes. Read [ARCHITECTURE.md](ARCHITECTURE.md) before non-trivial changes; [README.md](README.md) covers setup and env vars.

## Commands

```bash
npm run dev          # http://localhost:3000 (needs .env.local; see .env.example)
npx tsc --noEmit     # typecheck
npm run lint         # next lint
npm run build        # full production build
```

There are no tests. Verify with typecheck, lint, and build, and run the app for UI changes. Node 22 (`.nvmrc`).

## Rules that matter

- **Visibility.** Every DB read takes `visibleEmails` (from `getViewer()`/`requireAuth()` in `lib/auth-helpers.ts`) and filters on it. Every update or delete filters on the caller's own `owner_email`. New queries must follow this; it is the app's only access control between users.
- **Auth in routes.** Route handlers start with `const { viewer, error } = await requireAuth(); if (error) return error;` and set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- **Never expose Blob URLs.** `qrCodeUrl`/`pdfUrl` stay server-side; the browser gets `/api/tickets/[id]/qr`. See how `app/api/screenings/route.ts` strips them.
- **Dates.** Ticket `date` is a `DD-MM-YYYY` string and `start` is `HH:MM AM/PM`, both Amsterdam time. Use `lib/dates.ts` for parsing, formatting, and "now" (`getNow()`), never raw `new Date()` math.
- **Emails** go through `normalizeEmail` before storage or comparison.
- **LaunchDarkly is optional at runtime.** Every flag and AgentControl call has a code fallback. Keep it that way: use `evaluateBooleanFlag` (it reports `available`) and keep the OpenAI fallback paths in `lib/ticket-extractor.ts` and `lib/find-festival-link.ts`. Prompts live in code as `*_PROMPT` constants and are mirrored in the LaunchDarkly configs; if you change one, say the config needs the same edit.
- **Concurrency.** Group membership changes go through `withGroupLock`; ticket inserts go through `createTicketUnlessDuplicate`. Don't bypass them.
- **Schema changes** are new hand-run SQL files in `migrations/`; there is no migration runner. Update `lib/types.ts` and the `RETURNING`/`SELECT` column lists in `lib/db.ts` together.
- **`pdfjs-dist` worker.** `public/pdf.worker.min.mjs` must match the installed `pdfjs-dist` version. Copy it from `node_modules/pdfjs-dist/build/` whenever that package changes.

## Style

Match the existing code: SQL via the `sql` tagged template from `lib/db.ts`, columns aliased to camelCase in the query, small focused comments explaining why, `lucide-react` icons, Tailwind classes with the `idfa-*` colors from `tailwind.config.ts`.
