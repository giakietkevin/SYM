# SYM – Save your money

Jar-based spending and saving app (Phase 1 MVP of the PRD). Mobile-first PWA with **accounts**: each user signs in with a username and password and gets their own data, saved on the server and cached on the device so it still works offline.

```bash
npm install
npm run dev      # API on :8787 + web on :5173 (open http://localhost:5173, or the LAN address on a phone)
```

Production:

```bash
npm run build
HOST=0.0.0.0 PORT=8787 npm start     # serves the API and the built app together
```

Put it behind HTTPS in production and set `SYM_SECURE=1` (or send `X-Forwarded-Proto: https`) so the session cookie is `Secure`. Back up `server/data/sym.db` (the SQLite file, override with `SYM_DB`).

## Accounts and storage
- Username 3–24 chars (`a-z 0-9 . _ -`), password 8–128 chars. No email, so **there is no password recovery**.
- Passwords are stored only as salted scrypt hashes. Sessions are random tokens in an HttpOnly, SameSite cookie (30 days), stored hashed. Login is rate limited, cross-site writes are refused (Origin check).
- Each user's data is one JSON document. Every save carries the revision it was based on; if another device saved first, the two are **merged** (the ledger only grows and every line has a unique id), nothing is overwritten. Edge case: an undo done on one device can be brought back by a merge from another.
- Logging out removes the local copy from that device.
- Old data from before accounts existed (`sym.v1` in the browser) is not imported into any account.

## What is in Phase 1
- **Jars**: create / edit / delete spending jars (monthly limit) and saving jars (target + optional date), 16 living visuals, five colours.
- **Quick add**: big + button, calculator keypad (`35k+15k` → 50.000₫), 50k/100k/200k/500k shortcuts, time-of-day smart chips learned from your own history, undo.
- **Transfers**: drag the wallet card or any jar onto another jar (long-press on touch), or use Chuyển in the jar sheet. Optional note.
- **Mascot Xu**: smiles while every jar is fine, sweats when a jar passes 85% of its limit.
- **Feedback**: haptics (`navigator.vibrate`: Android and installed PWAs, not iOS Safari) and a synthesized "chinh!" sound, both switchable.
- **History**: grouped by day with filters.

## Data model
No balance is stored. Balances are derived from the ledger (`src/lib/types.ts`, `src/lib/store.ts`): each line moves money from/to the wallet or a jar, so the numbers cannot drift apart.

## Not yet built (PRD phases 2 and 3)
Auto-split rules (50/30/20), bubble chart, Weekly Pulse, biometrics, OCR, shared jars, password change/recovery. To ship as a native app, wrap with Capacitor to get true haptics.
