import pino from 'pino';
import { env, isProduction } from './config/env.js';

/**
 * Один логгер на процесс. В разработке — читаемый вывод, в проде — JSON-строки,
 * которые умеет разобрать любой сборщик логов (README §13).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

/** Дочерний логгер с постоянным полем — например, `service: "worker"`. */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
