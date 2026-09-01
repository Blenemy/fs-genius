import { PrismaClient } from '../generated/prisma/client.js';
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
