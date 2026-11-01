# SYM – Save your money

Jar-based spending and saving app (Phase 1 MVP of the PRD). Mobile-first PWA with **accounts**: each user signs in with a username and password and gets their own data, saved on the server and cached on the device so it still works offline.

```bash
npm install
npm run dev      # API on :8787 + web on :5173 (open http://localhost:5173, or the LAN address on a phone)
npm test         # unit tests for src/lib (Vitest)
```

Production:

```bash
npm run build
HOST=0.0.0.0 PORT=8787 npm start     # serves the API and the built app together
```

Put it behind HTTPS in production and set `SYM_SECURE=1` (or send `X-Forwarded-Proto: https`) so the session cookie is `Secure`. Passkeys use this host as the relying party; behind a proxy that changes the Host header, set `SYM_RP_ID` (the domain, e.g. `sym.example.com`) and `SYM_ORIGIN` (`https://sym.example.com`). Back up `server/data/sym.db` (the SQLite file, override with `SYM_DB`).

## Accounts and storage
- Sign-up takes a full name (optional), an **email and a phone number (both required)**, a username (3–24 chars: `a-z 0-9 . _ -`) and a password (8–128 chars). You can sign in with the username or the email.
- **One email, one account** (case-insensitive, enforced by a unique index as well as a check). Email and phone are set once and then **locked**: the profile page shows them read-only and the API refuses to change them. The name can be edited any time. The phone is stored normalised (`+84 912 345 678` -> `0912345678`); it is not required to be unique.
- **Password**: changed on the profile page (needs the current password; every other device is signed out). There is no email service, so a forgotten password is recovered with a **recovery code** (`XXXX-XXXX-XXXX-XXXX`, 80 bits) shown once at sign-up. "Quên mật khẩu?" takes username or email + code + new password, signs the person in and issues a new code (a code works once). Only a sha256 of the code is stored. Accounts made before codes existed create theirs from the profile page. Guesses are throttled per address and name.
- **Profile picture**: chosen on the profile page, cropped to a centred 256px square JPEG in the browser (which also drops photo metadata) and stored as a small data URL on the account. The server accepts only a JPEG, checked by its bytes. The header shows "Xin chào + name" with the picture (or initials).
- Accounts created before profiles existed are asked for email and phone once, on a "complete your profile" screen, then locked like the rest. Their data is untouched.
- The email is collected but nothing is sent yet (no email verification).
- Passwords are stored only as salted scrypt hashes. Sessions are random tokens in an HttpOnly, SameSite cookie (30 days), stored hashed. Login is rate limited, cross-site writes are refused (Origin check).
- Each user's data is one JSON document. Every save carries the revision it was based on; if another device saved first, the two are **merged** (the ledger only grows and every line has a unique id), nothing is overwritten. Deleted and undone lines are kept as tombstones, so a merge from a stale device cannot bring them back.
- Logging out removes the local copy from that device.
- **Passkeys** (profile page, and "Đăng nhập bằng passkey" on the sign-in screen): sign in with the device's fingerprint, face or PIN, no username or password. Adding one asks for the password again, so a borrowed session cannot plant a passkey. Up to 10 per account, each listed with when it was added and last used, and removable. Verification is done on the server with `node:crypto` and a small CBOR reader (`server/webauthn.mjs`): ES256, Ed25519 and RS256 keys, user verification required, attestation `none`, one-use challenges that expire after 5 minutes, and a signature counter that refuses a cloned key. Passkeys need HTTPS (or `http://localhost`), so they do not work over a plain LAN address. A password reset keeps the account's passkeys; remove any you do not recognise.
- **Signed-in devices** (profile page): every session with its browser and system, when it signed in and when it was last active (updated at most every 5 minutes). Any other device can be signed out, one by one or all at once. A session is listed by the first 16 hex of its stored hash, which cannot be used to sign in.
- **Delete account** (profile page): needs the password and the username typed out. The account, its data and every session are removed from the server for good (`ON DELETE CASCADE`); the device then signs out and clears its local copy.
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
- **Recurring transactions** (Settings): rent, subscriptions, salary, insurance. Weekly (a weekday), monthly (a day; a short month uses its last day), yearly (day and month; 29/2 falls back to 28/2) or every N days from a start date. Each occurrence writes one ordinary ledger line with a fixed id (`r:<id>:<YYYY-MM>` for monthly items, as before, `r:<id>:<YYYY-MM-DD>` for the others), so a reload or a second device never doubles it, a deleted line stays deleted, and days missed while the app was closed are filled in on the next open. An expense that would overdraw a saving jar waits until there is money. Salary can follow the auto-split rule. Changing the schedule of an item that has already run starts the new schedule after its last written line, so the past is never written again under new ids.
- **Backup** (Settings): download all data as JSON, export transactions as CSV for Excel (UTF-8 with BOM, formulas defused), and restore from a file. A restore is a merge, never an overwrite, so doing it twice changes nothing, a damaged file is rejected whole, and it can be undone right after.
- **Bubble view**: on the home screen, switch from jar cards to bubbles sized by balance (area, not width). Tap a bubble to open the jar. The choice is remembered per device.
- **Savings goals**: a saving jar with a due date shows whether it is on track (within 10% of the straight line from the day it was made), behind (and by how much), overdue, or done, plus what to put in each month to finish in time. Xu mentions a late goal on the home screen.
- **Split bills and debts** ("Chia tiền & nợ" card): pay a bill up front, list the friends, and SYM takes the whole amount from the jar and records each friend's share as a debt: equal (the payer absorbs the rounding), by amount, or by percent (rounded down; the payer keeps the rest). You can also note a loan in either direction. Nothing moves until a debt is settled, which writes one ordinary ledger line (`debt:<id>`) into the place you choose, so balances still come only from the ledger; undoing a bill also undoes its repayments. A debt can have a **due date** and be paid **in parts**: each part is its own line (`debt:<id>#<n>`), what is owed is the amount minus the live parts, and the debt closes when nothing is left. Paying everything at once still uses the fixed `debt:<id>`. A friend paying back a shared bill counts as a refund of that spending, not as income, in the reports; a loan paid back does not.
- **Xu and streaks**: Xu sparkles on a streak of 3+ days or a reached goal. The streak counts days with at least one line you wrote yourself (what SYM writes on its own, monthly lines and settlements, does not count). Eight badges are worked out from the ledger every time, never stored, and a new one is announced once per device after the toast that earned it.
- **Monthly report**: a card per month with spending (and the change on last month), income, saved, days logged, the top three jars and a one-line verdict, with a 1080x1350 picture to share or download (the Web Share sheet where the device has one). "Ẩn số tiền" makes the picture show percentages only.
- **Profile**: avatar in the header (and Hồ sơ in the desktop sidebar) opens the profile page.
- **History**: grouped by day with filters, and **search**: words in the note or jar names (accents optional, matched at the start of words), `#tags`, an exact amount (`50k`, `1tr`), and a date range, with the total of what is found.
- **Tags**: `#words` in a note (`Phở #sáng`), compared without case or accents. Nothing new is stored, so sync and backups are unchanged. Quick add and the edit sheet suggest the most used tags; History filters by them; the statistics rank spending by tag.
- **Reminders** ("Nhắc việc" card on the home screen): debts due within 3 days or overdue, recurring lines due within 3 days (and whether the money is there), and in the evening a day with nothing logged. Worked out from the data each time; a reminder can be hidden for the day on this device. They show while the app is open; there are no push notifications yet.
- **Statistics** ("Thống kê"): average monthly spending, income and savings over 6 or 12 months, monthly spending as bars (with a table view), each jar's trend against its own average, and a year summary with the biggest month, top jars and top tags.
- **Bank statement import** (Settings): a CSV from the bank. The header row and the date, description and amount (or debit/credit) columns are found automatically and can be corrected; amounts like `1.234.567`, `1,234,567.00`, `(1,000)` and `-50.000 VND` are read. Money out leaves a chosen jar, money in lands in a chosen place, with a preview first. Each line's id comes from its date, amount and text (`imp:<hash>`), so importing the same or an overlapping statement twice adds nothing. Imported lines do not count towards a streak.

## Data model
No balance is stored. Balances are derived from the ledger (`src/lib/types.ts`, `src/lib/store.ts`): each line moves money from/to the wallet or a jar, so the numbers cannot drift apart.

## Installable and offline
- The production build emits `sw.js` (source `sw/sw.js`, file list and version filled in by the plugin in `vite.config.ts`). It caches the app shell at install, so the app opens with no connection and then uses the data cached on the device. `/api` is never cached. Pages are network-first (4 s timeout, then the cached shell); hashed build files are cache-first. A new version takes over once every SYM tab is closed. The worker is registered in production only.
- Icons: `public/icons/` (192, 512, maskable 512) and `public/apple-touch-icon.png` (180, for iOS).

## Not yet built (PRD phases 2 and 3)
OCR, shared jars, email verification and recovery by email. To ship as a native app, wrap with Capacitor to get true haptics.
