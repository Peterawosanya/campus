import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

const app = Fastify({
  logger: true,
});

app.register(healthRoutes, { prefix: '/api' });

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

app
  .listen({ port, host })
  .then((address) => {
    app.log.info(`CampusOS API listening at ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
