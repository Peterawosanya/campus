# CampusOS Backend (Step 1 — local foundation)

Fastify + Drizzle + PostgreSQL 16 running in Docker. This replaces the
Supabase backend while preserving the entire Milestones 1–3 database schema.

## Layout

```
server/
  migrations/          Ported SQL (applied in filename order, once each)
    0000_local_compat.sql        Local users table, roles, current_user_id()
    0001_core_identity.sql       Schools, memberships, staff, audit logs
    0002_m1_onboarding_and_roles.sql   Onboarding RPC, multi-role memberships
    0003_school_operations.sql   Students, guardians, admissions, enrollment
    0004_milestone3_academics.sql Terms, attendance, assessments, results
  src/
    db/index.ts        Connection pool + Drizzle + withUserContext (RLS bridge)
    db/migrate.ts      Migration runner (npm run db:migrate)
    db/schema.ts       Drizzle table definitions (placeholder for Step 2)
    routes/health.ts   GET /api/health
    server.ts          Fastify entry point
docker-compose.yml     PostgreSQL 16 service
```

## Running locally on Windows PowerShell

Prerequisites: Docker Desktop (running), Node.js 20+.

```powershell
# 0. One-time: version-control checkpoint (run in the project root)
git init
git add -A
git commit -m "Checkpoint: Supabase-era state (Milestones 1-3)"

# 1. Start PostgreSQL
docker compose up -d
docker compose ps          # wait for STATUS: healthy

# 2. Configure the server
Copy-Item .env.example server/.env
# Default values work unchanged for local Docker.

# 3. Install and migrate
cd server
npm install
npm run db:migrate

# 4. Start the API (leave this window running)
npm run dev

# 5. In a SECOND PowerShell window, test health + database connectivity:
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

### Expected output per command

| Command | Success looks like |
|---|---|
| `docker compose up -d` | `Container campusos-db Started` (or Created/Healthy lines) |
| `docker compose ps` | `campusos-db ... healthy` under STATUS |
| `npm run db:migrate` | `+ 0000_local_compat.sql (applied)` … `+ 0004_milestone3_academics.sql (applied)` then `Migrations complete.` Re-running prints `= file (already applied)` for each. |
| `npm run dev` | `{"level":30,...,"msg":"Server listening at http://127.0.0.1:3001"}` |
| `Invoke-RestMethod .../health` | JSON with `status: ok`, `database: connected`, `latency_ms` |

To reset the database: `docker compose down -v` (deletes local data), then
`up -d` and migrate again.

## How the three moving parts work (beginner notes)

**docker-compose.yml** — a recipe file telling Docker: run PostgreSQL 16,
name it `campusos-db`, keep data in a named volume so it survives restarts,
expose port 5432, and report healthy once `pg_isready` succeeds. The
credentials come from environment variables with safe local defaults.

**The connection pool (`server/src/db/index.ts`)** — opening a database
connection is slow, so the server keeps up to 10 connections open and reuses
them. One caveat: a pooled connection is reused across requests, so any
per-request state must be undone before it is handed to the next request.
That is what `withUserContext` guarantees.

**The compatibility layer (`migrations/0000_local_compat.sql`)** — Supabase
provided three things plain Postgres does not have: an `auth.users` table, an
`auth.uid()` function, and the `anon`/`authenticated` roles. The compat file
recreates all three: a plain `public.users` table (password hashing and login
come in Step 2), a `current_user_id()` function that reads a per-transaction
setting, and NOLOGIN roles so every `GRANT` and every `TO authenticated`
policy in the ported schema applies unchanged.

**The RLS bridge (`withUserContext`)** — Supabase enforced row security per
web request. Locally, the server connects as the database owner, and Postgres
exempts owners from RLS. So every authenticated request must run inside
`withUserContext(userId, fn)`, which in ONE transaction:

1. stamps the user id into the `app.current_user_id` setting,
2. switches the connection to the `authenticated` role (`SET LOCAL ROLE`),
3. runs the handler's queries,
4. commits — and both the setting and the role switch evaporate with the
   transaction, so nothing leaks to the next request on that connection.

**The migration runner (`db/migrate.ts`)** — reads every `.sql` file in
`server/migrations/` sorted by name (0000 before 0001, so the compat layer
exists before anything references it), skips files already recorded in
`schema_migrations`, and applies each new file inside its own transaction:
if any statement fails, the whole file rolls back and the runner stops with a
non-zero exit. Re-running is always safe.

## Supabase dependencies: preserved vs. adapted

| Supabase feature | Status locally |
|---|---|
| Tables, enums, constraints, composite `(school_id, id)` foreign keys, indexes, unique partial indexes | Preserved verbatim |
| Validation/business-logic triggers and the 25 SQL functions (registration, admissions, results, attendance...) | Preserved verbatim, `auth.uid()` → `current_user_id()` |
| RLS policies | All kept and active. Until Step 2, nothing sets the identity setting, so `current_user_id()` returns NULL and policies deny everything — the same as a logged-out Supabase request. |
| RLS *enforcement path* | Adapted: RLS now fires because the server sets `SET LOCAL ROLE authenticated` per transaction (`withUserContext`). Never query with the bare pool for user-facing requests. |
| Auth (login, password hashing, sessions) | NOT implemented (Step 2, per instructions) |
| Signup trigger (`handle_new_user` on `auth.users`) | Removed; profile creation will move into the Step 2 registration endpoint's transaction |
| Storage (`school-documents` bucket + 4 policies) | Removed; will be re-implemented as local-disk/S3 behind Fastify endpoints with the same school-scoped rules |

### Safety rules going forward

- Migration 0000's roles must never be dropped or made login-capable.
- `SET LOCAL ROLE authenticated` is only safe because `authenticated` is
  NOLOGIN — the server must already hold an owner connection to switch. Keep
  it that way.
- Any endpoint touching tenant data goes through `withUserContext`; a code
  review checklist item for every new route.
