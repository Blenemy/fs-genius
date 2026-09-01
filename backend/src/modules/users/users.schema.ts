import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'имя не может быть пустым').max(100),
  email: z.email('нужен корректный адрес почты'),
  country: z.string().trim().length(2).default('UA'),
  city: z.string().trim().min(1).max(80).default('Kyiv'),
});

export const reportQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  country: z.string().trim().length(2).optional(),
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE']).optional(),
  days: z.coerce.number().int().min(1).max(3650).default(365),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
