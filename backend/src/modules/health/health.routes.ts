import { Router } from 'express';
import { healthService } from '../../lib/container.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res) => {
  const report = await healthService.check();
  res.status(report.status === 'ok' ? 200 : 503).json(report);
});
