import { Router } from 'express';
import { learnEventsHub, learnService } from '../../lib/container.js';

export const learnRouter: Router = Router();

learnRouter.get('/events', (req, res) => {
  void learnEventsHub.subscribe(req, res);
});

learnRouter.post('/jobs', async (_req, res) => {
  const result = await learnService.enqueue();
  res.status(202).json(result);
});
