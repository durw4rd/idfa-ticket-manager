# CLAUDE.md

IDFA Ticket Manager: a Next.js 15 (App Router, React 19, TypeScript, Tailwind 3) app on Vercel for uploading IDFA festival PDF tickets, extracting them with AI, and showing a shared schedule with QR codes. Read [ARCHITECTURE.md](ARCHITECTURE.md) before non-trivial changes; [README.md](README.md) covers setup and env vars.

## Commands

```bash
npm run dev          # http://localhost:3000 (needs .env.local; see .env.example)
npx tsc --noEmit     # typecheck
npm run lint         # eslint (flat config, next/core-web-vitals)
npm test             # vitest: pure logic in lib/*.test.ts
npm run build        # full production build
```

Unit tests cover the pure logic in `lib/` (`lib/*.test.ts`, Vitest); add one when you change dates, agenda, parsing or matching code. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on every PR. Run the app for UI changes. Node 22 (`.nvmrc`).

## Rules that matter

- **Visibility.** Every DB read takes `visibleEmails` (from `getViewer()`/`requireAuth()` in `lib/auth-helpers.ts`) and filters on it. Every update or delete filters on the caller's own `owner_email`. The one exception is `updateTicketHolder`: the owner *or* the current holder may hand a ticket to someone in their `visibleEmails`. New queries must follow this; it is the app's only access control between users.
- **Auth in routes.** Route handlers start with `const { viewer, error } = await requireAuth(); if (error) return error;` and set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`. The exceptions are the Postmark webhook `app/api/inbound/email`, which checks `INBOUND_WEBHOOK_SECRET` and takes the user from the address token, and `app/api/access-ended`, which signs out a user whose access has ended (requireAuth would just answer 401).
- **Never expose Blob URLs.** `qrCodeUrl`/`pdfUrl` stay server-side; the browser gets `/api/tickets/[id]/qr`. Client components get screenings through `toAgendaScreening` in `lib/agenda.ts`, which strips them. Keep emails out of URLs too (the poster route takes a crew index).
- **Vote links are credentials.** A voting URL goes only to the holder of its ticket (`getVoteLinksForScreening`), is never logged, and is never sent to a model.
- **Dates.** Ticket `date` is a `DD-MM-YYYY` string and `start` is `HH:MM AM/PM`, both Amsterdam time. Use `lib/dates.ts` for parsing, formatting, and "now" (`getNow()`), never raw `new Date()` math. A screening's end is `screeningEnd(start, endsAt)`, which falls back to a typical length when IDFA hasn't given one. Client components can't see `TEST_DATE`, so pages pass `getNow()` down as a `now` prop.
- **Emails** go through `normalizeEmail` before storage or comparison.
- **LaunchDarkly is optional at runtime.** Every flag and AgentControl call has a code fallback. Keep it that way: use `evaluateBooleanFlag` (it reports `available`), call AgentControl configs through `invokeAgentConfig` (`lib/agent-config.ts`, returns null when the fallback should run), and keep the OpenAI fallback paths in `lib/ticket-extractor.ts`, `lib/find-festival-link.ts` and `lib/vote-link-extractor.ts`. Prompts live in code as `*_PROMPT` constants and are mirrored in the LaunchDarkly configs; if you change one, say the config needs the same edit.
- **Concurrency.** Group membership changes go through `withGroupLock`; ticket inserts go through `createTicketUnlessDuplicate`; both use `withAdvisoryLock` in `lib/db.ts` (multi-statement writes use `withTransaction`). Don't bypass them.
- **Schema changes** are new hand-run SQL files in `migrations/`; there is no migration runner. Update `lib/types.ts` together with the row mapper (`toTicket` in `lib/db.ts` for tickets; other queries alias their columns).
- **`pdfjs-dist` worker.** `public/pdf.worker.min.mjs` must match the installed `pdfjs-dist` version. Copy it from `node_modules/pdfjs-dist/build/` whenever that package changes.

## Style

Match the existing code: SQL via the `sql` tagged template from `lib/db.ts`, columns aliased to camelCase in the query, small focused comments explaining why, `lucide-react` icons.

UI is mobile-first (one `max-w-xl` column, bottom tab bar) and built from the primitives in `components/ui/` (`Button`, `Avatar`, `Chip`, `SegmentedControl`, `Sheet`, `Field`/`Notice`, `EmptyState`); use them rather than hand-rolled class strings. Colours are the tokens in `app/globals.css` (`paper`, `surface`, `ink`, `ink-2`, `ink-3`, `line`, `spark`, `danger`, `crew-0…5`), which also cover dark mode; don't use raw Tailwind colours. Type uses the 5-step scale in `tailwind.config.ts` plus `font-display` for film titles and `label` for small caps headings. Yellow (`spark`) only marks now / next / you. People are always shown as `Avatar`s with their crew colour (`getCrew` in `lib/groups.ts`).
