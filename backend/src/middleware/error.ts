import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';
import { isProduction } from '../config/env.js';

/**
 * Ошибка с машиночитаемым кодом. Всё, что бросается осознанно, — через неё.
 * Формат ответа зафиксирован в README §10 и собирается только здесь:
 * в контроллерах не должно быть ни одного res.status(500).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Маршрут ${req.method} ${req.path} не найден`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err }, 'unhandled error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера',
      // Стек наружу отдаём только в разработке.
      details: isProduction ? undefined : { message: (err as Error)?.message },
    },
  });
};
