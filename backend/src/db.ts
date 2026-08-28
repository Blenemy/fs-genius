import { PrismaClient } from './generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from './config/env.js';

/**
 * Prisma 7 подключается к базе через driver adapter, а не через url в схеме.
 * Один экземпляр на процесс: и api, и воркер импортируют этот же модуль.
 */
const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const prisma = new PrismaClient({ adapter });

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
