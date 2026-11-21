import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// One connection pool shared by the whole server. The pool keeps a handful of
// connections open so requests do not pay the cost of connecting every time.
// SSL is enabled only when explicitly requested via the connection string
// (local Docker Postgres does not use TLS).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  ssl: /sslmode=require/.test(process.env.DATABASE_URL ?? '')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Placeholder schema module. In Step 2+ we add Drizzle table definitions and
// re-export them here; for now Drizzle runs raw SQL (migrations + health
// check), which does not need generated table objects.
export const db = drizzle(pool);

export type Db = typeof db;
