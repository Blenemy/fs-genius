# Backend conventions

Читать вместе с [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Стек: Express 5, TypeScript, Prisma, BullMQ, pino. Ориентиры: RealWorld Express+Prisma (тонкий HTTP), bulletproof-nodejs (сервисный слой), bullmq-example (продюсер ≠ процессор).

Новый код — в структуру ниже. Старые `routes/users.ts` и учебная очередь не задают стиль.

## Папки

```
backend/src/
  index.ts              # HTTP-процесс: listen, shutdown
  worker.ts             # процесс воркера: Worker.close, Redis, Prisma
  app.ts                # createApp(): middleware + сборка роутов
  config/env.ts         # Zod по process.env, падение на старте
  lib/                  # prisma, redis, logger — не бизнес
  middleware/           # error, auth, rate-limit
  modules/
    auth/
      auth.routes.ts
      auth.service.ts
      auth.schema.ts    # Zod
    uploads/
    assets/
    telegram/
  queues/
    queue-names.ts      # единственное место имён очередей
    probe.queue.ts      # класс-продюсер
  worker/
    probe.processor.ts  # класс-процессор
  shared/               # DTO задач, общие типы api+worker
```

Модуль = фича. Роут не импортирует Prisma и `Queue` напрямую — только сервис. Воркер не импортирует `express`, `app.ts`, роуты.

Пока нет `packages/shared`, типы задач живут в `src/shared`. Имя очереди не дублировать строкой в двух файлах.

## Классы — где да

Класс, если есть состояние или зависимости, которые стыдно таскать аргументом через полпроекта:

- сервисы (`AuthService`, `AssetService`)
- продюсеры очередей (`ProbeQueue`)
- процессоры воркера (`ProbeProcessor`)
- инфраструктура со состоянием (`RequestCoalescer`)

Сборка вручную в одном месте (`lib/container.ts` или рядом с `app.ts` / `worker.ts`). Без Inversify и декораторов.

```ts
export class AssetService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly probeQueue: ProbeQueue,
  ) {}

  async completeUpload(userId: string, assetId: string) {
    // квота, проверка объекта в S3, транзакция, probeQueue.add(...)
  }
}

export class ProbeQueue {
  constructor(private readonly queue: Queue) {}

  add(data: ProbeJobData) {
    return this.queue.add('probe', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
  }
}

export class ProbeProcessor {
  async process(job: Job<ProbeJobData>) {
    // скачать, ffprobe, статус в БД, publish прогресса
  }
}
```

## Классы — где нет

Функции, если нет состояния:

- обработчики роутов (`Router`)
- middleware (`errorHandler`, `requireAuth`)
- чистые мапперы и Zod-схемы
- `createApp()`

Роут тонкий: Zod → сервис → `res.json`. Ошибки — `throw new AppError(...)`. Никакого `res.status(500)` в модуле.

```ts
assetsRouter.post('/uploads/:id/complete', async (req, res) => {
  const result = await assetService.completeUpload(req.user.id, req.params.id);
  res.status(202).json(result);
});
```

Prisma вызываем из сервиса. Отдельный `*Repository` не заводим, пока нет второй базы.

## HTTP и ошибки

- Префикс `/api`, JSON, формат `{ error: { code, message, details? } }` только из `middleware/error.ts`
- Access в заголовке, refresh в httpOnly cookie
- Проверка владельца актива на каждом мутирующем и скачивающем маршруте
- После `Queue.add` ответ сразу: задача в очереди, не «обработка закончена»

## Очереди и процессы

- `Queue` в процессе api, `Worker` в `worker.ts`. Два разных ioredis (`createRedis(..., 'queue')`). Один экземпляр ioredis не шарить между Queue, Worker и QueueEvents
- Соединение и `Queue` живут, пока жив процесс. Не `close()`/`quit()` на каждый запрос
- Процессор — чистый метод класса; `new Worker(name, (job) => processor.process(job), { connection, concurrency })` в точке входа воркера
- Ретраи только на временные ошибки. Битый файл — без повторов (`UnrecoverableError` / эквивалент)
- Отмена: ещё в очереди — `queue.remove`; уже running — ключ `cancel:{jobId}` в Redis, воркер проверяет между стадиями

## SSE

`GET /api/events` — одно соединение на клиента. Снимок активных задач при открытии, дальше кадры по Redis pub/sub / QueueEvents. Heartbeat комментарием, чтобы прокси не закрыл поток. Nginx: `proxy_buffering off` (уже на `/api/events`).

## Логи и конфиг

- pino, без `console.log` в модулях
- Комментарии и сообщения логов на английском в stdout (консоль Windows). Документация и UI — на русском
- Новые секреты только через `config/env.ts`

## Не делать

- Тащить sharp/ffmpeg в образ и процесс api
- Класть файл в `job.data`
- Писать `progress` в MySQL на каждый процент
- `concurrency > 2` на `media:video`
- Импортировать учебный `bullMQjobs` / очередь `buttonClick` из продуктовых модулей
