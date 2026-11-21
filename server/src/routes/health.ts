import type { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const started = Date.now();
    const { rows } = await pool.query<{ now: string; version: string }>(
      'SELECT now() AS now, version() AS version',
    );
    return {
      status: 'ok',
      database: 'connected',
      server_time: rows[0].now,
      postgres_version: rows[0].version.split(' ')[0],
      latency_ms: Date.now() - started,
    };
  });
}
