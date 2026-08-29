import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config/env.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  // За обратным прокси нужен реальный IP клиента — для лимитов частоты и логов.
  app.set('trust proxy', 1);

  // BIGINT из MySQL приезжает в Prisma как BigInt, а JSON.stringify его не умеет
  // и падает. Числа здесь — байты и счётчики, они заведомо меньше 2^53,
  // поэтому безопасно отдавать их обычным числом.
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? Number(value) : value,
  );

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use('/api', healthRouter);
  app.use('/api', usersRouter);

  // Порядок обязателен: сначала 404, потом единый обработчик ошибок.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
