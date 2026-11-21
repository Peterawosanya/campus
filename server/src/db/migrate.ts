// Minimal migration runner for the ported SQL files.
//
// Why not Drizzle Kit's migrate? Our SQL files came from Supabase verbatim and
// contain procedural blocks (DO $$ ... $$), which Drizzle's generated-journal
// flow handles awkwardly. This runner applies each file in order, once, and
// records it in a schema_migrations table.

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM public.schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.version));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ ${file} (applied)`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log('Migrations complete.');
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
