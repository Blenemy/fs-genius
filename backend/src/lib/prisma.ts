import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env.js';

/**
 * Prisma 7 connects through a driver adapter, not a URL in the schema.
 * One instance per process: api and worker import this same module.
 */
const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const prisma = new PrismaClient({ adapter });

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Нарушение уникального индекса. Проверять занятость ЗАРАНЕЕ нельзя: между
 * SELECT и INSERT успевает вклиниться второй такой же запрос, поэтому ловим
 * ошибку вставки.
 *
 * instanceof, а не 'code' in err: duck-typing совпадёт с любой ошибкой,
 * у которой случайно есть поле code — включая ошибки драйвера и Node.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
