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
2. In the Supabase SQL editor or with the Supabase CLI, apply [`supabase/migrations/20261011230000_create_registrations.sql`](./supabase/migrations/20261011230000_create_registrations.sql).
3. The migration creates `public.registrations`, generated normalized email and identifier columns, independent unique constraints, branch/year checks, a created-at index, and RLS that denies `anon` and `authenticated` table access. The server-only Supabase secret key is used for the insert API and must never be exposed to Vite.

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

If the original migration was already applied, do not edit or rerun it as a replacement. Apply the incremental [`supabase/migrations/20261011231500_add_canonical_sr_no_mapping.sql`](./supabase/migrations/20261011231500_add_canonical_sr_no_mapping.sql), which creates the mapping table and adds `canonical_sr_no` without dropping registrations.

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
