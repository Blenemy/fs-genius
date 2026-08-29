import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { disconnectDb } from './db.js';
import { disconnectRedis } from './redis.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`api слушает http://localhost:${env.PORT}`);
});

/**
 * Корректное завершение: перестаём принимать соединения, закрываем базу
 * и Redis. Без этого при передеплое часть запросов обрывается на середине,
 * а брошенные соединения висят у сервера до собственного таймаута.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`получен ${signal}, останавливаю api`);

  server.close(() => {
    logger.info('http-сервер закрыт');
  });

  try {
    await disconnectDb();
  } catch (err) {
    logger.error({ err }, 'ошибка при отключении от базы');
  }

  // Отдельный try: упавшее отключение от базы не должно оставить
  // Redis незакрытым, и наоборот.
  try {
    await disconnectRedis();
  } catch (err) {
    logger.error({ err }, 'ошибка при отключении от redis');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
