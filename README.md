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
```

`SUPABASE_SECRET_KEY` must remain server-only. Never rename it with a `VITE_` prefix or put it in frontend code. `.env` is ignored by git.

## Supabase setup

Before resetting an existing installation, open the Supabase Dashboard SQL Editor and paste/run the complete contents of [`supabase/row-count.sql`](./supabase/row-count.sql). It checks the row counts of the two legacy tables.

- If both counts are zero (or the tables do not exist), open the SQL Editor, paste the complete contents of [`supabase/setup.sql`](./supabase/setup.sql), and click **Run**. The script also refuses to drop either table if it contains a row.
- If either count is non-zero, do not run the reset. Preserve the data and request an approved forward-only migration decision; this repository does not infer or merge identities.
- After a successful setup, paste/run [`supabase/verify.sql`](./supabase/verify.sql) in the SQL Editor and confirm the expected table, columns, constraints, indexes, RLS, and grants.

The setup schema includes the future QR and check-in columns but this phase does not use them.

For an existing installation, apply [`supabase/identifier-constraints.sql`](./supabase/identifier-constraints.sql) as a forward-only migration. It changes only the identifier check constraints and does not drop tables or registration rows.

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
- Responses use `{ success, message }`; invalid input is `400`, duplicate identifiers are `409`, rate limits are `429`, and unexpected database failures are `500`.
- There is no public registration listing, edit, delete, or export endpoint.

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
Phase 1 — Registration backend
Existing registration form, validation, Supabase and application tests.


Phase 2 — QR tickets Current phase
Generate a unique secure ticket, save it in the database, show it on the success screen, and let students download it.


Phase 3 — Email delivery
Send each student their ticket and QR code by email.

Phase 4 — Admin portal
Secure login, registration management and attendance overview.

Phase 5 — Event-day scanning
Verify tickets against Supabase and automatically record attendance, rejecting invalid and previously used tickets.


## Duplicates (each should be rejected with the red message)

#	What to enter	Expected
1	Same Sr. No. 24-0540, new USN, new email	“Sr. No. already registered”
2	New Sr. No. 24-0541, USN typed 1js24is160, new email	“USN already registered”
3	New Sr. No., new USN, email SHRINIVASRJAHAGIRDAR8@GMAIL.COM	“email already registered”
4	New Sr. No., email shrinivas.rjahagirdar8@gmail.com (dot added)	“email already registered”
5	New Sr. No., email shrinivasrjahagirdar8+test@gmail.com	“email already registered”

Should succeed

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