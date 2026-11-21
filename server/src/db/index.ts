import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import 'dotenv/config';

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

// Transaction-scoped user identity -- the RLS bridge.
//
// The pool connects as the database owner, and PostgreSQL exempts the table
// owner from Row Level Security. That is safe only if every authenticated
// request runs through this helper, which:
//   1. opens a transaction,
//   2. stamps the acting user id into the 'app.current_user_id' setting
//      (what public.current_user_id() reads -- the auth.uid() stand-in),
//   3. switches the connection's role to 'authenticated' for the remainder of
//      the transaction, so RLS policies apply exactly as they did on Supabase,
//   4. undoes everything automatically when the transaction ends.
// Because SET LOCAL ROLE and set_config(..., true) are transaction-scoped, the
// identity can never leak into the next request on the same pooled connection.
export async function withUserContext<T>(
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId ?? '']);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Placeholder schema module. In Step 2+ we add Drizzle table definitions and
// re-export them here; for now Drizzle runs raw SQL (migrations + health
// check), which does not need generated table objects.
export const db = drizzle(pool);

export type Db = typeof db;
