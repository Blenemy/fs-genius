// Prisma 7 вынес конфигурацию подключения из schema.prisma сюда.
// Схема описывает только структуру; строка подключения живёт в окружении.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// prisma generate к базе не подключается — при сборке образа переменной нет,
// и это нормально. Командам migrate и studio она нужна, они и сообщат об этом.
const databaseUrl = process.env.DATABASE_URL;

// Теневая база нужна только команде migrate dev: она пересобирает в ней схему
// с нуля, чтобы посчитать разницу. Обычный пользователь приложения не имеет
// прав создавать базы, поэтому подключение идёт под root и к отдельной базе.
// На сервере выполняется migrate deploy, которому теневая база не нужна.
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Используется только CLI. Рантайм-клиент подключается
  // через driver adapter — см. src/db.ts.
  ...(databaseUrl
    ? { datasource: { url: databaseUrl, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } }
    : {}),
});
