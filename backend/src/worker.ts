import { childLogger } from './logger.js';
import { createRedis } from './redis.js';
import { disconnectDb } from './db.js';

/**
 * Точка входа воркера — отдельный процесс от api, общая база и общий Redis
 * (README §4). Пока это заглушка: подключение есть, обработчиков очередей нет.
 *
 * На этапе M2 сюда добавляются Worker'ы BullMQ для очередей media:probe
 * и media:image, на M3 — media:video, на M4 — notify (README §8).
 */
const log = childLogger({ service: 'worker' });
const redis = createRedis();

redis.on('ready', () => log.info('redis готов'));
redis.on('error', (err) => log.error({ err }, 'ошибка redis'));

log.info('worker started — очереди пока не зарегистрированы');

async function shutdown(signal: string): Promise<void> {
  log.info(`получен ${signal}, останавливаю worker`);

  // Порядок важен: сначала перестаём брать задачи, потом рвём соединения.
  try {
    await redis.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, 'ошибка при остановке');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
