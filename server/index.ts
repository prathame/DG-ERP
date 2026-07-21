import dotenv from 'dotenv';
dotenv.config();

import type { Server } from 'http';
import { assertCriticalEnv } from './utils/env';
assertCriticalEnv();

import { initDatabase, pool } from './pg-db';
import { createApp } from './app';
import { logger } from './utils/logger';

const app = createApp();
const PORT = process.env.PORT || 3001;

let server: Server | undefined;
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });

  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 25_000);
  forceTimer.unref?.();

  const finish = async () => {
    try {
      await pool.end();
    } catch {
      /* pool may already be closed */
    }
    try {
      await logger.flush();
    } catch {
      /* ignore flush errors on exit */
    }
    clearTimeout(forceTimer);
    process.exit(0);
  };

  if (!server) {
    void finish();
    return;
  }
  server.close(err => {
    if (err) {
      logger.error('HTTP server close error', { error: err.message });
    }
    void finish();
  });
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
    server = app.listen(PORT, () => {
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
