# Brook Hill Events

The landing hub for Brook Hill Alliance's summer events. One page, a card per category, routes students to each one.

Live: https://brookhill-events.web.app

## What's here

- **Discos** - links out to the disco app
- **Recreation** - live, with reservations
- **Social Rooms** - live, with reservations
- More sections get added as they go live

It's a plain static site, no build step. To turn on a new section, find its card in `public/index.html`, wrap it in a link, and flip the status pill.

## Reservations

Recreation and Social Rooms show a live headcount and a reserve button. Reserving checks the student against the camp roster server-side through a Cloud Function - the roster itself never touches the browser. A confirmed reservation writes to the shared Firestore project used by the disco app, and a live listener keeps the counts updated for everyone looking at the page.

Students can see everything they've reserved (and cancel) from `my-reservations.html`, and returning to a page they're already checked into just works via a remembered local ID.

## Staff dashboard

Gated behind a real Firebase Auth login - staff sign in with a username and password, no email involved on their end (internally it maps to a fixed dummy domain so Firebase's auth provider is happy). Shows every upcoming session and who's signed up for it, live.

Setting it up requires enabling email/password auth in the Firebase console and adding a user manually - details are in the code if you're picking this up.

## Deploying

```
firebase deploy --only hosting
```

Note: the Firestore security rules for reservations actually live in the disco app's repo, since it's a shared database. Deploy those from there, not from here.
