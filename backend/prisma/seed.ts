/**
 * Наполнение базы данными для проверки кеша.
 *
 * Цель — не реалистичные данные, а честно тяжёлый запрос: десятки тысяч
 * пользователей и сотни тысяч загрузок, чтобы отчёт из GET /api/users/report
 * считался заметное время и разница с кешем была видна в Postman.
 *
 * Объём настраивается переменными окружения:
 *   SEED_USERS=30000 SEED_UPLOADS_PER_USER=12 npm run db:seed
 *
 * Скрипт идемпотентный: сначала удаляет строки с префиксом seed-, потом
 * заполняет заново. Настоящие учётки, заведённые через регистрацию, он не
 * трогает — иначе один случайный запуск стоил бы всей базы пользователей.
 */
import { hash } from '@node-rs/argon2';
import { prisma } from '../src/lib/prisma.js';

/**
 * Пароль всех сидовых пользователей. Данные здесь заведомо публичные,
 * секретности от него не требуется — нужен рабочий хеш, под которым можно
 * зайти и посмотреть, как ведёт себя экран с чужими данными.
 */
const SEED_PASSWORD = 'seed-password';

const USERS = Number(process.env.SEED_USERS ?? 30_000);
const UPLOADS_PER_USER = Number(process.env.SEED_UPLOADS_PER_USER ?? 12);

// Вставляем пачками: одна многострочная INSERT на BATCH строк.
// По строке за запрос сид на полмиллиона строк идёт часами.
const BATCH = 1_000;

const COUNTRIES = ['UA', 'PL', 'DE', 'US', 'GB', 'FR', 'ES', 'IT', 'NL', 'CZ'];
const CITIES = [
  'Kyiv', 'Lviv', 'Warsaw', 'Krakow', 'Berlin', 'Munich', 'New York', 'Austin',
  'London', 'Manchester', 'Paris', 'Lyon', 'Madrid', 'Rome', 'Amsterdam', 'Prague',
];
const COMPANIES = [
  'Northwind', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark Industries',
  'Wayne Enterprises', 'Cyberdyne', 'Soylent', 'Vandelay',
];
const PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const;
const KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'] as const;
const STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const;
const BIO_WORDS = [
  'фотограф', 'видеомонтаж', 'подкаст', 'архив', 'репортаж', 'таймлапс',
  'дрон', 'студия', 'свадьба', 'реклама', 'обзор', 'стрим', 'курс', 'блог',
];

/**
 * Детерминированный генератор: при одном и том же объёме база получается
 * одинаковой, и замеры до и после кеша сравнимы между запусками.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const random = makeRandom(20260829);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function makeBio(): string {
  const words = Array.from({ length: 12 + Math.floor(random() * 20) }, () => pick(BIO_WORDS));
  return words.join(' ');
}

/** Дата в пределах последних `days` дней. */
function pastDate(days: number): Date {
  return new Date(Date.now() - Math.floor(random() * days * 86_400_000));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  console.log(`Чищу сидовые строки…`);
  // Удаляем только то, что создал сам сид: с появлением регистрации в этих
  // таблицах живут настоящие учётки, и безусловный DELETE снёс бы их вместе
  // с их активами и refresh-токенами по каскаду.
  // Upload первым: на нём внешний ключ на User.
  await prisma.$executeRawUnsafe(
    "DELETE FROM `Upload` WHERE `userId` LIKE 'seed-user-%'",
  );
  await prisma.$executeRawUnsafe(
    "DELETE FROM `User` WHERE `id` LIKE 'seed-user-%'",
  );

  // Один argon2 на весь сид, а не на строку: хеш считается ~50 мс, и на
  // 30 000 пользователей это были бы десятки минут вместо секунд.
  // Общая соль на всех здесь безразлична — данные выдуманные.
  const passwordHash = await hash(SEED_PASSWORD);

  console.log(`Создаю ${USERS} пользователей…`);
  const userIds: string[] = [];

  for (let start = 0; start < USERS; start += BATCH) {
    const size = Math.min(BATCH, USERS - start);
    const rows = Array.from({ length: size }, (_, i) => {
      const n = start + i;
      const id = `seed-user-${n.toString().padStart(7, '0')}`;
      userIds.push(id);
      const createdAt = pastDate(720);
      return [
        id,
        `user${n}@example.com`,
        `${pick(CITIES)} User ${n}`,
        createdAt,
        createdAt,
        passwordHash,
        pick(PLANS),
        random() > 0.15 ? 1 : 0,
        pick(COUNTRIES),
        pick(CITIES),
        random() > 0.3 ? pick(COMPANIES) : null,
        makeBio(),
        `https://example.com/avatars/${n % 500}.png`,
        BigInt(1_073_741_824) * BigInt(1 + Math.floor(random() * 20)),
        random() > 0.2 ? pastDate(60) : null,
      ];
    });

    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await prisma.$executeRawUnsafe(
      'INSERT INTO `User` (`id`,`email`,`name`,`createdAt`,`updatedAt`,`passwordHash`,' +
        '`plan`,`isActive`,`country`,`city`,`company`,`bio`,`avatarUrl`,`quotaBytes`,' +
        '`lastLoginAt`) VALUES ' +
        placeholders,
      ...rows.flat(),
    );

    if ((start / BATCH) % 5 === 0) console.log(`  пользователей: ${start + size}/${USERS}`);
  }

  const totalUploads = USERS * UPLOADS_PER_USER;
  console.log(`Создаю ~${totalUploads} загрузок…`);

  let made = 0;
  for (const users of chunk(userIds, Math.ceil(BATCH / UPLOADS_PER_USER))) {
    const rows: unknown[][] = [];

    for (const userId of users) {
      // Разброс вокруг среднего: у кого-то пусто, у кого-то вдвое больше.
      const count = Math.floor(random() * UPLOADS_PER_USER * 2);
      for (let i = 0; i < count; i += 1) {
        const kind = pick(KINDS);
        rows.push([
          `seed-upload-${made}-${i}`,
          userId,
          kind,
          random() > 0.1 ? 'DONE' : pick(STATUSES),
          BigInt(Math.floor(random() * 500_000_000) + 10_000),
          kind === 'VIDEO' || kind === 'AUDIO' ? Math.floor(random() * 3_600_000) : null,
          `${pick(BIO_WORDS)} ${i}`,
          pastDate(365),
        ]);
      }
      made += 1;
    }

    if (rows.length === 0) continue;

    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    await prisma.$executeRawUnsafe(
      'INSERT INTO `Upload` (`id`,`userId`,`kind`,`status`,`sizeBytes`,`durationMs`,' +
        '`title`,`createdAt`) VALUES ' + placeholders,
      ...rows.flat(),
    );

    if (made % 5_000 < users.length) console.log(`  загрузки для ${made}/${USERS} пользователей`);
  }

  // Считаем именно сидовые строки: настоящие учётки в эту цифру попадать
  // не должны, иначе непонятно, отработал сид или нет.
  const seeded = { id: { startsWith: 'seed-user-' } };
  const [users, uploads] = await Promise.all([
    prisma.user.count({ where: seeded }),
    prisma.upload.count({ where: { userId: { startsWith: 'seed-user-' } } }),
  ]);
  console.log(`Готово: ${users} пользователей, ${uploads} загрузок.`);
  console.log(`Пароль у всех сидовых пользователей: ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
