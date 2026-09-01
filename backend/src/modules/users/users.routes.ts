import { Router } from 'express';
import { AppError } from '../../middleware/error.js';
import { usersService } from '../../lib/container.js';
import { createUserSchema, reportQuerySchema } from './users.schema.js';

export const usersRouter: Router = Router();

usersRouter.get('/users/report', async (req, res) => {
  const parsed = reportQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Некорректные параметры отчёта',
      {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    );
  }

  res.json(await usersService.getReport(parsed.data));
});

usersRouter.get('/users', async (_req, res) => {
  const users = await usersService.list();
  res.json({ users });
});

usersRouter.post('/users', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Проверь заполненные поля', {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const user = await usersService.create(parsed.data);
  res.status(201).json({ user });
});
