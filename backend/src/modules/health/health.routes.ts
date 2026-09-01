import { Router } from 'express';

export const healthRouter: Router = Router();

/**
 * Stub. M0 will add separate checks for MySQL, Redis, and object storage
 * (README §13).
 */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
