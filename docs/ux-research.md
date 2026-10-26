# UX research: mobile redesign

The app has three jobs:

1. See my agenda and my crew's.
2. Get to my ticket instantly.
3. Rate and comment on films I've seen.

This file records the baseline usability walkthrough done before the redesign, the findings, and the design decisions they led to. After the redesign, the same tasks get re-run and the **After** columns get filled in.

## Method

- **Build**: `main` at `c5e82fe`, `npm run dev` with `TEST_DATE=2026-11-15T13:30:00Z` (day 4 of IDFA 2026, 12–22 Nov).
- **Device**: Chrome with a 370×763 viewport (phone width, mouse input). iOS Safari behaviour was checked against the code, not run on a device.
- **Data**: the real account. It holds 23 screenings / 28 tickets for 2026 (14 still upcoming), 16 films for 2025, and the group Misa & Martina. The walkthrough was read-only; no rating or ticket was changed.
- **Measures per task**: taps, scroll distance (in phone screens of about 760 px), success, and friction notes.

## Baseline task results

| # | Task | Taps | Scroll | Result | Friction | After |
|---|---|---|---|---|---|---|
| T1 | What's my next screening, and where? | 0 | 0 | ✅ Pass | The "Up next" hero answers it above the fold. It takes 315 px, though, and the first list row starts at y=634, so on load you see only one screening. Times are US 12h ("4:00 PM"), dates are US order with the year repeated. || ✅ 0 taps. Up next sits above the fold, and list rows are ~66 px, so today's three screenings are all on the first screen. Times are 24h. |
| T2 | Show its QR at the door, full screen | 1–2 | 0 | ⚠️ Partial (❌ on iPhone) | "Show QR code" opens the detail page anchored at `#qr`. The QR renders at **192 px (52% of the width)**, with a cropped barcode bar above it and the fullscreen button sitting on top of the crop. Fullscreen uses the element Fullscreen API, which iOS Safari doesn't support, so on an iPhone the button does nothing. Every QR takes a wake lock on mount, even when collapsed. || ✅ 1 tap (Agenda → **Show ticket**; the Tickets tab shows the next QR inline). The QR is 326 px (88% of the width) in a white CSS overlay that also works on iOS (checked in code, not on a device). Wake lock is held only while the overlay is open. |
| T3 | What is Martina doing tomorrow evening? | – | – | ❌ Fail | It can't be answered. All 28 tickets were uploaded by Misa, and the only person data is the uploader. There's no holder and no filter, so Martina's agenda is invisible. || ✅ 1 tap on the **Martina** chip. List and timeline both filter by holder. Today it shows 0, because no 2026 ticket has been handed to Martina yet (see T6). |
| T4 | Which screenings are we seeing together? | 0 | ~4 screens | ⚠️ Partial | Shared screenings only show as "2 tickets" plus a heart icon on the card. You have to scan all 14 upcoming cards (158 px each, about 3,000 px) to find them, and "2 tickets" doesn't say who holds them. || ✅ 0 taps. Rows show a **Together** marker and the holders' avatars. In Timeline, shared screenings line up across lanes, and clashes are outlined in red. |
| T5 | Rate yesterday's film and add a comment | 4 | ~5 screens | ⚠️ Pass, high friction | Yesterday's films are in "Show past screenings (9)" at the **bottom** of the page, below every upcoming day, and drawn at 60% opacity. Then: tap the card, scroll past the collapsed QR, tap a star (saves immediately), expand "Add a comment", type, and tap "Save Comment". "Your rating" and the crew list don't update until reload. The 10 stars are 28×28 px and fill 298 of 370 px, so they overflow at 320 px. || ✅ 3 taps, no scrolling: **Films** → score in the **To rate** queue → Save (the comment box appears after scoring). The page refreshes after saving. The scale fits 320 px. |
| T6 | Give one of the two tickets for a shared screening to Martina | – | – | ❌ Fail | There's no holder concept. || ✅ 2 taps on the detail page: **Hand over** → pick Martina. The uploader or the current holder can do it, and new uploads pick a holder at review. Permissions were checked against the API and DB (rolled back); not run on real tickets yet. |
| T7 | See or share my whole festival at a glance | 0 | ~5 screens | ❌ Fail (share), ⚠️ Partial (view) | The 2026 list is 3,846 px tall, one card per screening, one column. There's no compact or timeline view and no export or share. The 2025 recap (stats + ranked list) is the best overview in the app, but it only exists for past years. || ✅ View: 1 tap (**Timeline**), the whole festival in ~3 screens. Share: 2 taps (share icon → Share), which sends a PNG poster to the phone's share sheet, with Save image as a fallback. |

## Heuristic findings

**Typography**
- The system font stack is used, with no display face.
- One screen uses **10 distinct size/weight combinations** (12/600, 14/400, 14/500, 14/600, 16/400, 16/500, 16/600, 18/700, 24/700, 30/700) and no scale.
- Film titles drawn over venue artwork, such as "Lonan Tché" on the Tuschinski pattern, are hard to read.

**Contrast (WCAG AA)**
- Metadata grey `#757575` on white is 4.61:1, which passes, just.
- Past cards are drawn at `opacity-60`. Their metadata falls to about **2.2:1, which fails AA**.

**Tap targets**
- Year pills are 61×34 px.
- Rating stars are 28×28 px.
- "Fix details" and "Delete" are small text links.
- All of these are below 44 px.

**Chrome and hierarchy**
- On mobile, a 73 px non-sticky header (logo + "Festival Manager" + email + sign-out) takes the top of every screen. The bottom bar holds Screenings, Upload, Sharing.
- Upload is a rare action but has a permanent tab.
- The route is `/settings` but the label says "Sharing".

**Consistency**
- Screening metadata is drawn four different ways: card, hero, archive row, detail.
- There are five padding variants of the primary button.
- Radius is mixed: `rounded`, `-md`, `-lg` and `-xl`.

**Content order**
- Past screenings sit below the future ones. During the festival, though, "yesterday" is exactly when you want to rate.
- The detail page leads with calendar and directions, not the ticket.

**Feedback**
- Saving a rating doesn't refresh the page state.
- Deleting a rating reloads the whole page.
- `window.confirm` is used for destructive actions.

**Locale**
- The festival is in Amsterdam, but times are 12h and dates are in US order.

## Findings → design decisions

| Finding | Decision in the redesign |
|---|---|
| QR is two steps away, small, and has no iPhone fullscreen (T2) | **Tickets** tab plus a one-tap QR from "Up next". The QR overlay is CSS full screen (works on iOS), white, and as large as the screen allows. Wake lock is held only while the overlay is open. Target: 1 tap from launch. |
| Crew agendas are invisible (T3, T4, T6) | Tickets get a **holder** (assigned by the uploader or the current holder). The Agenda gets **person filter chips**, avatars on every row, and a "Together" marker. |
| A single long card list, with nothing at a glance (T7) | **Rows instead of cards**, so a day fits on a screen. A **List / Timeline** toggle, where the timeline has one lane per person per day and shows clashes. A **shareable festival poster** exported as PNG. |
| Rating is buried at the bottom and stale after saving (T5) | A **Films** tab with a "To rate" queue of films you held a ticket for that have finished. A 1–10 scale that fits 320 px. One Save for score and comment, followed by `router.refresh()`. |
| No type system; low contrast on past items | One family (Archivo), with condensed bold titles and tabular 24h times. A 5-step type scale. Past items are muted with a colour token that still passes AA, not with opacity. |
| The header eats space; Upload has a permanent tab | Slim sticky header: title, `+` upload, and an avatar linking to Crew. Tabs follow the three jobs: Agenda · Tickets · Films. |
| Many inconsistent one-off styles | A shared set of `components/ui` primitives and colour tokens, with dark mode via the same tokens. |

## After the redesign

The same seven tasks were re-run on the redesign: same data, same `TEST_DATE`, in Chrome at 370 px (and 320 px through an iframe), in dark and light colour schemes.

- **All 7 tasks succeed.** Before: 1 clean pass, 3 with high friction, 3 failures.
- **Getting the QR at the door:** 1 tap. Its width went from 52% to 88% of the screen.
- **No horizontal overflow at 320 px** on Agenda, Tickets, Films, Crew or the detail page.
- **Contrast:** past items use the `ink-3` token at about 4.9:1 instead of 60% opacity.
- **Tap targets:** primary controls are 44 px. The rating scale grows with the screen width (10 equal segments). Chips are 36 px.

Still open:
- iOS Safari wasn't run on a device. The QR overlay and `navigator.share` with files should be checked on an iPhone.
- Timeline blocks are too narrow for titles. A tap shows a caption with the title, time and venue.
- Clashes are worked out per holder. All 2026 tickets are still held by the uploader, so pairs of overlapping screenings (one of them probably meant for Martina) show as clashes until one ticket in each pair is handed over.

## Think-aloud script (about 10 minutes, for a crew-mate on the new build)

Hand over the phone with the app open on Agenda. Ask them to think out loud, and don't help. Note where they hesitate, mis-tap or backtrack.

1. "You're at the cinema door for your next film. Show your ticket."
2. "What are you and Misa both seeing this week?"
3. "Misa can't make Thursday's film. Take over that ticket."
4. "You saw a film yesterday. Rate it and leave one sentence about it."
5. "Send a friend a picture of your whole festival."
6. "Anything that confused you, or anything you'd remove?"

For each task, record success, time and taps, and add a line to the **After** column above.
