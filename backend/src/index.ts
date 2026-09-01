import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectApi } from './lib/container.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`got ${signal}, shutting down api`);

  server.close(() => {
    logger.info('http server closed');
  });

  try {
    await disconnectApi();
  } catch (err) {
    logger.error({ err }, 'error while disconnecting');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
