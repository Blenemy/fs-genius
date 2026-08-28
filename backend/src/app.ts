import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config/env.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  // За обратным прокси нужен реальный IP клиента — для лимитов частоты и логов.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use('/api', healthRouter);

  // Порядок обязателен: сначала 404, потом единый обработчик ошибок.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
