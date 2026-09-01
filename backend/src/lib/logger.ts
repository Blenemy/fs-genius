import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * One logger per process. Pretty in development, JSON lines in production
 * for log collectors (README §13).
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

/** Child logger with a stable field — e.g. `service: "worker"`. */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
