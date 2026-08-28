// Prisma 7 вынес конфигурацию подключения из schema.prisma сюда.
// Схема описывает только структуру; строка подключения живёт в окружении.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// prisma generate к базе не подключается — при сборке образа переменной нет,
// и это нормально. Командам migrate и studio она нужна, они и сообщат об этом.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Используется только CLI. Рантайм-клиент подключается
  // через driver adapter — см. src/db.ts.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
