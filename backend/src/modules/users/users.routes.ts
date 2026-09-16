import { Router } from 'express';
import { usersService } from '../../lib/container.js';
import { parseOrThrow } from '../../lib/parse.js';
import { createUserSchema, reportQuerySchema } from './users.schema.js';

export const usersRouter: Router = Router();

usersRouter.get('/users/report', async (req, res) => {
  const data = parseOrThrow(
    reportQuerySchema,
    req.query,
    'Некорректные параметры отчёта',
  );

  res.json(await usersService.getReport(data));
});

usersRouter.get('/users', async (_req, res) => {
  const users = await usersService.list();
  res.json({ users });
});

usersRouter.post('/users', async (req, res) => {
  const data = parseOrThrow(createUserSchema, req.body, 'Проверь заполненные поля');
  const user = await usersService.create(data);
  res.status(201).json({ user });
});
