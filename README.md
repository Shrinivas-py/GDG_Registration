# GDG Chapter 2.0 registration

React/Vite/Tailwind frontend and Node/Express API for the GDG Chapter 2.0 registration flow. The API uses the server-side Supabase client; the browser never connects to Supabase.

## Prerequisites

- Node.js 20 or newer
- A Supabase project
- PowerShell, macOS/Linux shell, or equivalent terminal

## Environment

Copy `.env.example` to `.env` and fill in the server values locally:

```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-only-supabase-secret-key
FRONTEND_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3001
TRUST_PROXY=false
```

`SUPABASE_SECRET_KEY` must remain server-only. Never rename it with a `VITE_` prefix or put it in frontend code. `.env` is ignored by git.

Admin authentication also requires the following values:

```env
ADMIN_EMAIL_ALLOWLIST=admin1@example.com,admin2@example.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-browser-safe-supabase-anon-key
```

`ADMIN_EMAIL_ALLOWLIST` is read only by the API and is the authoritative authorization
list. Keep it limited to approved team addresses; changing it requires an API restart.
The Vite values are public browser configuration used only to call Supabase Auth
from the admin sign-in form. The Supabase secret key remains server-only and must
never be included in frontend variables. Admins sign in with their pre-created
Supabase email/password account; the API still verifies the bearer token and
server-side allowlist before every protected request.

Set `TRUST_PROXY` to the number of trusted reverse-proxy hops in production (for
example, `1` when the app is directly behind one load balancer). It may also be
`true` or `false`; keep it `false` for direct local access. This setting controls
which client IP Express uses for public rate limiting, so do not enable it unless
the proxy path is controlled by the deployment.

Rate limits are independent by route group and configurable with
`REGISTRATION_RATE_LIMIT` (default `300`), `ADMIN_LOGIN_RATE_LIMIT` (default
`10`), `ADMIN_SESSION_RATE_LIMIT` (default `120`), `CHECK_IN_RATE_LIMIT`
(default `600`), and `ADMIN_EXPORT_RATE_LIMIT` (default `30`). Their windows use
`RATE_LIMIT_WINDOW_MS` (default 15 minutes), with `*_WINDOW_MS` route-specific
overrides available. Failed admin session authentications are counted by IP and
submitted email; successful authentications are not counted. Authenticated
session, check-in/scan, and export limits are keyed to the verified admin rather
than the client IP. Registration duplicates remain protected by database
uniqueness constraints.

The application does not send transactional email. Registrations return the ticket
immediately so the participant can download the PNG/PDF ticket. Participants can
recover an existing ticket by supplying the registered Sr. No.; the
rate-limited recovery response contains the QR image data but never a raw QR token.

## Supabase setup

Before resetting an existing installation, open the Supabase Dashboard SQL Editor and paste/run the complete contents of [`supabase/row-count.sql`](./supabase/row-count.sql). It checks the row counts of the two legacy tables.

- If both counts are zero (or the tables do not exist), open the SQL Editor, paste the complete contents of [`supabase/setup.sql`](./supabase/setup.sql), and click **Run**. The script also refuses to drop either table if it contains a row.
- If either count is non-zero, do not run the reset. Preserve the data and request an approved forward-only migration decision; this repository does not infer or merge identities.
- After a successful setup, paste/run [`supabase/verify.sql`](./supabase/verify.sql) in the SQL Editor and confirm the expected table, columns, constraints, indexes, RLS, and grants.

The setup schema includes the QR ticket, fallback ID, legacy email-delivery, recovery-token, and future check-in columns. Email-delivery and recovery-token columns/tables are retained for schema compatibility but are not used by the application.

For an existing installation, apply [`supabase/identifier-constraints.sql`](./supabase/identifier-constraints.sql) and then [`supabase/phase-2-email-recovery.sql`](./supabase/phase-2-email-recovery.sql) as forward-only migrations. Do not run either against a live project until the migration has been reviewed and approved. Verify Phase 2 with [`supabase/phase-2-verify.sql`](./supabase/phase-2-verify.sql). The Phase 2 migration does not drop tables or registration rows. There is no rollback that removes the new columns or recovery table; if deployment must be reverted, leave the additive schema in place and roll back application code.

## Install and run

```bash
npm install
npm run server
```

In a second terminal:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:3001`.

## API

- `GET /api/health` returns a minimal health response.
- `POST /api/registrations` accepts `name`, `sr_no`, optional `usn`, `email`, `branch`, and `year`.
- A successful registration returns an opaque `ticket.token`, a stable `ticket.reference`, and display-safe participant details for the confirmation ticket. The token is the only QR payload.
- `POST /api/ticket-recovery` recovers an existing ticket when the Sr. No. matches. Sr. No. is database-unique; the endpoint never creates a registration or changes the QR token.
- `POST /api/admin/ticket-recovery` lets an authenticated allowlisted admin recover a ticket using a fallback ID, ticket reference, or USN. Raw QR tokens are not accepted for this recovery operation.
- `GET /api/admin/dashboard` returns database-backed registered, checked-in, and remaining totals for an authorized admin.
- `GET /api/admin/attendees` provides authorized server-side pagination, search, and `checked_in=true|false` filtering.
- `GET /api/admin/attendees.csv` and `/api/admin/attendees.xlsx` provide authorized formula-safe exports without QR tokens or recovery secrets.
- `POST /api/admin/check-in/lookup` supports protected lookup by one opaque QR token, ticket reference, fallback ID, or USN without returning the QR token.
- `POST /api/admin/check-in` records a first check-in using a database-conditional update; repeated scans return the original check-in timestamp.
- `GET /api/admin/attendance` and the attendance CSV/XLSX endpoints provide protected attendance records and bounded exports.

XLSX files are generated server-side in the fixed export format without the
vulnerable `xlsx`/SheetJS package. The implementation uses the MIT-licensed
`fflate` ZIP library and writes only the required workbook XML parts. CSV and
XLSX exports retain the same fields and formula-injection protection.
- Responses use `{ success, message }`; invalid input is `400`, duplicate identifiers are `409`, rate limits are `429`, and unexpected database failures are `500`.
- There is no public registration listing, edit, delete, or export endpoint.
- `GET /api/admin/session` requires `Authorization: Bearer <Supabase access token>`.
  The API verifies the token with Supabase Auth and checks the verified email against
  `ADMIN_EMAIL_ALLOWLIST`; browser-supplied email or role fields are ignored.

The server normalizes input before validation, performs one direct insert, and relies on database uniqueness constraints for race-safe duplicate detection.

## Tests and build

```bash
npm test
npm run build
```

Tests use mocked repositories and a fresh in-memory integration database; they do not require Supabase credentials and cannot modify production registrations. The optional load-test script is for a non-production environment only:

```powershell
$env:LOAD_TEST_URL="http://localhost:3001"; npm run load-test
```

## still more to go 
Phase 1 — Registration backend and QR tickets
The registration form, validation, Supabase persistence, opaque QR tickets, confirmation screen, and PNG/PDF downloads are implemented and tested in application code.


Phase 2 — Ticket delivery and fallback ID
Return the ticket directly after registration, assign a unique database-enforced four-digit participant ID, and provide protected admin-assisted recovery without email.

Phase 3 — Admin portal
Google/Supabase Auth sign-in, server-verified admin authorization, logout, and a
protected portal are implemented.

Phase 4 — Admin dashboard, attendee management, and exports
Database-backed counts, paginated/searchable attendee viewing, and CSV/XLSX exports
are implemented. Check-in mutations and QR scanning remain deferred to Phase 5.

Phase 5 — QR scanning, manual check-in, and attendance reports
The authorized dashboard now includes a rear-camera QR scanner when supported, manual
lookup by fallback ID, ticket reference, or USN, atomic server-side check-in, attendance
counts, recent check-ins, filters, and attendance exports. Camera access is requested
only after an authorized admin opens the scanner and requires HTTPS or localhost.

### Google OAuth setup

1. In Supabase Dashboard, enable Google under **Authentication → Providers**.
2. Create a Google OAuth web application in Google Cloud Console.
3. Add the Supabase-provided callback URL shown by the Google provider configuration
   to Google's authorized redirect URIs, and configure the client ID/secret in
   Supabase. Do not put the Google client secret in this repository.
4. Add the local and production site URLs under Supabase **Authentication → URL
   Configuration**, including `/gdg-control-panel-7x9` as the application redirect target where
   appropriate.
5. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the server-side
   `ADMIN_EMAIL_ALLOWLIST`, then restart both applications.

An allowlisted Google account is still denied if its verified Supabase Auth email is
not in the server allowlist. Removing an address from the allowlist takes effect
after the API restarts. The current phase intentionally exposes no attendee data or
admin operations.

Phase 4 — Event-day scanning
Verify tickets against Supabase and automatically record attendance, rejecting invalid and previously used tickets.


## Duplicates (each should be rejected with the red message)

#	What to enter	Expected
1	Same Sr. No. 24-0540, new USN, new email	“Sr. No. already registered”
2	New Sr. No. 24-0541, USN typed 1js24is160, new email	“USN already registered”
3	New Sr. No., new USN, email SHRINIVASRJAHAGIRDAR8@GMAIL.COM	“email already registered”
4	New Sr. No., email shrinivas.rjahagirdar8@gmail.com (dot added)	“email already registered”
5	New Sr. No., email shrinivasrjahagirdar8+test@gmail.com	“email already registered”

Should succeed!!

#	What to enter	Expected
6	24-0542, no USN, a@test.com	saved
7	24-0543, no USN, b@test.com	saved (two blank USNs don’t collide)
8	Sr. No. typed with spaces around it, 24-0544	saved as 24-0544

Invalid input (should be rejected, nothing saved)

#	What to enter	Expected
9	USN 1JS24IS16 (9 chars)	rejected
10	USN 2JS24IS160 (wrong prefix)	rejected
11	Sr. No. 240540 or 24-054	rejected
12	Name A (one character) or just spaces	rejected
13	Email abc@ or abc@gmail	rejected
14	Double-click Submit fast with fresh valid data	only one row