# GDG Chapter 2.0 registration

Phase 2 adds a JavaScript Express API backed by Supabase PostgreSQL while preserving the Phase 1 React/Vite registration page and supplied image assets.

## Architecture

- `src/` — React/Vite student registration UI at `/`
- `server/` — Express API; privileged Supabase credentials are server-only
- `supabase/migrations/` — reproducible PostgreSQL schema and RLS migration
- `test/` — API tests using an injected repository, so they do not require live credentials
- `scripts/load-test.js` — staging-only concurrent request script

## Supabase setup

1. Create a Supabase project at [supabase.com](https://supabase.com/).
2. Apply [`supabase/migrations/20261011230000_create_registrations.sql`](./supabase/migrations/20261011230000_create_registrations.sql) if starting from an empty project.
3. Apply [`supabase/migrations/20261011233000_reconcile_registration_schema.sql`](./supabase/migrations/20261011233000_reconcile_registration_schema.sql) to existing installations or after the initial migration. It is forward-only, preserves rows, fails before constraints when unresolved null/duplicate data exists, creates the mapping table and atomic RPC, and refreshes PostgREST.
4. Run the read-only checks in [`supabase/diagnostics.sql`](./supabase/diagnostics.sql) before accepting registrations.
5. The server-only Supabase secret key is used for the RPC and must never be exposed to Vite. Anonymous and authenticated table/RPC access is revoked; only the server's `service_role` can execute the registration function.

For an existing project, open the SQL editor and run the files in this order:

```text
supabase/migrations/20261011230000_create_registrations.sql
supabase/migrations/20261011233000_reconcile_registration_schema.sql
supabase/diagnostics.sql
```

If the first file was already applied, do not rerun it; run only the reconciliation migration and then the diagnostics. The reconciliation migration is the repair for the observed errors: `PGRST205` meant `student_identifier_map` was absent from the exposed schema, `PGRST204` meant `canonical_sr_no` was absent from `registrations`, and `42501` meant the caller lacked access to the mapping table. The new RPC avoids direct table access from the API and is executable only by the server role.

## Environment

Copy `.env.example` to `.env` and fill in real values locally. Never commit `.env`.

```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-only-supabase-secret-key
FRONTEND_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3001
```

`SUPABASE_SECRET_KEY` may be the server-side Supabase secret/service-role key supported by the project. It belongs only in the backend environment. `FRONTEND_ORIGIN` accepts a comma-separated allowlist for deployed frontend origins. `VITE_API_BASE_URL` is optional when the API is served from the same origin.

## Install and run

```bash
npm install
npm run server
```

In a second terminal:

```bash
npm run dev
```

Production frontend build:

```bash
npm run build
npm run preview
```

The API endpoint is `POST http://localhost:3001/api/registrations`. It accepts:

```json
{
  "name": "Ada Lovelace",
  "usnOrSrno": "001CS42",
  "email": "ada@example.com",
  "branch": "CSE",
  "year": "1st Year"
}
```

The server trims names and identifiers, lowercases email and identifier values for the independent database uniqueness constraints, validates the allowlisted branch/year values, limits JSON request size, applies rate limiting, and returns `201` only after Supabase confirms the insert. Duplicate email or identifier requests return `409`; invalid requests return `400`.

### USN and SrNo mapping limitation

The public field remains `USN / SrNo`. The migration adds `student_identifier_map`, which must be populated with authoritative, normalized `usn` → `sr_no` records supplied by the college. When a submitted identifier matches that table, the API stores the mapped canonical SrNo and the unique canonical SrNo index prevents registering once with the USN and again with that SrNo.

No mapping data is currently present in this repository. Until the college supplies and imports that mapping, an unmapped value is treated as a provisional SrNo candidate so direct duplicate SrNo submissions remain protected, but cross-identifier USN/SrNo duplicate prevention is **not solved**. The API does not infer mappings from names, branch, year, or identifier shape, and does not fuzzy-match or merge records.

If a migration stops with a conflict message, do not delete rows automatically. Use the diagnostic queries to identify the conflict and resolve it with an approved college data decision, then rerun the forward migration. After applying it, run `NOTIFY pgrst, 'reload schema';` if PostgREST still reports `PGRST204`, `PGRST205`, or `PGRST202`.

## Tests and load test

Run the backend tests:

```bash
npm test
```

These tests use a fake injected repository and cover successful saves, validation errors, duplicate email and identifier conflicts, concurrent conflict handling, database failures, and the absence of a public registration-list endpoint. They do not prove connectivity to a live Supabase project.

For a staging environment only, after setting `LOAD_TEST_URL`, run 100 unique requests:

```bash
$env:LOAD_TEST_URL="https://staging-api.example.com"; npm run load-test
```

The script uses unique `example.invalid` emails and identifiers. Do not run it against production because it creates test registrations.

## Admin and security

The student page has no admin link and no public registration-list endpoint. `/admin` remains a separate placeholder route; real server-side authentication and authorization are still required before exposing admin functionality. Do not put database credentials or Supabase service-role/secret keys in `VITE_` variables or frontend code.

## Production configuration

Deploy the API with `PORT`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and the production `FRONTEND_ORIGIN`. Build the frontend with `VITE_API_BASE_URL` pointing to the deployed API origin, or serve both behind the same origin and leave it unset. Configure the Supabase migration before accepting traffic.
