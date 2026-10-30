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
- Sign-up takes a full name (optional), an **email and a phone number (both required)**, a username (3–24 chars: `a-z 0-9 . _ -`) and a password (8–128 chars). You can sign in with the username or the email.
- **One email, one account** (case-insensitive, enforced by a unique index as well as a check). Email and phone are set once and then **locked**: the profile page shows them read-only and the API refuses to change them. The name can be edited any time. The phone is stored normalised (`+84 912 345 678` -> `0912345678`); it is not required to be unique.
- Accounts created before profiles existed are asked for email and phone once, on a "complete your profile" screen, then locked like the rest. Their data is untouched.
- There is still **no password recovery** (the email is collected but nothing is sent yet).
- Passwords are stored only as salted scrypt hashes. Sessions are random tokens in an HttpOnly, SameSite cookie (30 days), stored hashed. Login is rate limited, cross-site writes are refused (Origin check).
- Each user's data is one JSON document. Every save carries the revision it was based on; if another device saved first, the two are **merged** (the ledger only grows and every line has a unique id), nothing is overwritten. Deleted and undone lines are kept as tombstones, so a merge from a stale device cannot bring them back.
- Logging out removes the local copy from that device.
- Old data from before accounts existed (`sym.v1` in the browser) is not imported into any account.

## What is in Phase 1
- **Jars**: create / edit / delete spending jars (monthly limit) and saving jars (target + optional date), 16 living visuals, five colours.
- **Quick add**: big + button, calculator keypad (`35k+15k` → 50.000₫), 50k/100k/200k/500k shortcuts, time-of-day smart chips learned from your own history, undo.
- **Transfers**: drag the wallet card or any jar onto another jar (long-press on touch), or use Chuyển in the jar sheet. Optional note.
- **Mascot Xu**: smiles while every jar is fine, sweats when a jar passes 85% of its limit.
- **Feedback**: haptics (`navigator.vibrate`: Android and installed PWAs, not iOS Safari) and a synthesized "chinh!" sound, both switchable.
- **Auto-split**: set a rule once (percent per jar, presets 50/30/20 and equal, whatever is unassigned stays in the wallet). Income can be split on entry with one checkbox, or the wallet can be split on demand. One undo reverses the income and every split line.
- **New month**: when the month changes, a banner offers to refill the spending jars: *Nạp đủ* (back to the monthly limit, surplus returns to the wallet), *Cộng thêm* (keep the leftover and add one more limit) or *Bỏ qua*, chosen per jar. If the wallet cannot cover it, jars are refilled in order and the shortfall is shown.
- **Edit and delete past transactions**: tap any line in History, Gần đây or a jar's sheet to change its amount, note, date and jar(s), or delete it. Changes that would push the wallet or a saving jar below zero are refused with the reason (a spending jar may go over its limit). A line from a split or a month refill can be deleted alone or as a whole group. Every edit and delete has a one-tap undo. Lines that touch a closed jar are read-only history.
- **Weekly Pulse**: a card on the home screen with one friendly headline for the week (Monday to Sunday), a seven-day spending chart, and the key numbers; tap for the per-jar breakdown. Comparisons use the same elapsed time last week, so a Tuesday is not judged against a whole week, and an empty week is never celebrated as "spending down".
- **Dark mode**: sun/moon button in the header, and Auto / Light / Dark in Settings (Auto follows the system live). Applied before first paint, so there is no light flash. It is a per-device preference and is not synced.
- **Profile**: avatar in the header (and Hồ sơ in the desktop sidebar) opens the profile page.
- **History**: grouped by day with filters.

## Data model
No balance is stored. Balances are derived from the ledger (`src/lib/types.ts`, `src/lib/store.ts`): each line moves money from/to the wallet or a jar, so the numbers cannot drift apart.

## Not yet built (PRD phases 2 and 3)
Bubble chart, recurring items, biometrics, OCR, shared jars, password change/recovery (and email verification). To ship as a native app, wrap with Capacitor to get true haptics.
