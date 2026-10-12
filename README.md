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
