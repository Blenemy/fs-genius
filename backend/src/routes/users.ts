import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../middleware/error.js';

export const usersRouter: Router = Router();

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'имя не может быть пустым').max(100),
  email: z.email('нужен корректный адрес почты'),
});

/**
 * Временные эндпоинты для проверки, что база доступна и миграции применены.
 * Настоящая работа с пользователями появится на M1 вместе с аутентификацией:
 * тогда создание пользователя станет регистрацией, а список закроется правами.
 */

usersRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

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

  try {
    const user = await prisma.user.create({ data: parsed.data });
    res.status(201).json({ user });
  } catch (err) {
    // P2002 — нарушение уникального индекса, здесь это занятая почта.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Такая почта уже зарегистрирована');
    }
    throw err;
  }
});
