import { Router } from 'express';

export const healthRouter: Router = Router();

/**
 * Заглушка. На этапе M0 сюда добавляются раздельные проверки
 * MySQL, Redis и объектного хранилища (README §13).
 */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
