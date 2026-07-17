import dotenv from 'dotenv';
dotenv.config();

import { assertCriticalEnv } from './utils/env';
assertCriticalEnv();

import { initDatabase } from './pg-db';
import { createApp } from './app';
import { logger } from './utils/logger';

const app = createApp();
const PORT = process.env.PORT || 3001;

function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  Promise.resolve(logger.flush())
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', reason => {
  logger.fatal('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
process.on('uncaughtException', err => {
  logger.fatal('Uncaught exception', {
    error: err.message,
    stack: err.stack,
  });
  Promise.resolve(logger.flush())
    .catch(() => undefined)
    .finally(() => process.exit(1));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      const env = process.env.NODE_ENV || 'development';
      logger.info('API server started', {
        port: Number(PORT),
        environment: env,
        db: 'postgresql',
      });
    });
  })
  .catch(err => {
    logger.fatal('Failed to start server', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
