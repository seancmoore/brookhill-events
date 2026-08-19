# Brook Hill Events — Roadmap

The hub is live with roster-verified reservations on Recreation and Social Rooms.
This is the running list of what could come next, roughly in priority order.

## Done
- [x] **Roster-verified reservations** on Recreation + Social Rooms (live counts,
      one-tap reserve/cancel).
- [x] **Staff dashboard** (`staff.html`) — password-gated, who's reserved per
      session, live.
- [x] **My Reservations** (`my-reservations.html`) — a student's own reservations
      across categories, with cancel.
- [x] **Per-session detail** — every Recreation/Social Rooms session has a
      title, emoji and description in `data.js`; cards open a shareable
      poster-style flyer (`#f=<index>` deep link).
- [x] **More categories** — Trips & Excursions (`trips.html`) live on the hub:
      the season's 41 day excursions + overnights from the master program.

## Near term
- [ ] ~~Capacity caps + waitlist~~ — not wanted (per Panky).
- [ ] **Cancel confirmation** — a small "Cancel your spot?" confirm instead of the
      current one-tap toggle, to avoid accidental cancels.
- [ ] **Staff: export / past sessions** — let staff see past attendance and export
      a session's list (CSV / copy).

## Medium term
- [ ] **Auto-regenerate `data.js`** — script the export from St. John's Master
      Program.xlsx (ActivityCalendar tab) so schedule changes are one command.
      Source: `Desktop\Work Summer 2026\Source`.
- [ ] **"My reservations" view** — show a checked-in student everything they've
      reserved across categories, with quick cancel.
- [ ] **Reminders** — opt-in day-of notification (would need email/SMS or web push).

## Hardening / nice-to-have
- [x] **Real staff login** — staff.html now uses a real Firebase Auth
      (email/password) account instead of a hardcoded password.
- [ ] **Lock down the name data** — reservation docs are still publicly readable
      (the schedule pages + disco DJ dashboard depend on it). To make names truly
      staff-only: gate `rsvps` reads on `request.auth`, move public "going" counts
      to a Cloud Function-maintained counter, and give the disco DJ dashboard the
      same auth treatment (shared rules).
- [ ] **Rules consolidation** — the `sessions/*/rsvps` rules live in the disco repo
      (shared DB). Consider a single source-of-truth rules file if this grows.
- [ ] **Analytics** — simple count of reservations per session over time.

## Notes
- Reservations reuse the disco app's `verifyStudent` Cloud Function and the shared
  `brookhill-disco-2026` Firestore. See `README.md` for the architecture.
- Roster groups currently: `1C-NIA`, `1G`. Coverage window 2026-06-17 → 06-30 per
  the disco roster; extend `functions/roster.js` in the disco repo if it grows.
