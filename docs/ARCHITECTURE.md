# Архитектура

Рабочий фундамент поверх README. Источники паттернов: feature-модули как в bulletproof-react / bulletproof-nodejs, тонкий HTTP как в RealWorld Express+Prisma, продюсер и процессор очереди как в bullmq-example. Не копируем Nest, гексагон и DI-контейнеры.

Конвенции слоёв: [backend/CONVENTIONS.md](../backend/CONVENTIONS.md), [frontend/CONVENTIONS.md](../frontend/CONVENTIONS.md).

## Процессы

Три долгоживущих процесса, ни один пользовательский HTTP-запрос не ждёт ffmpeg.

| Процесс | Делает | Не делает |
|---|---|---|
| **api** | auth, presign, постановка задач, чтение MySQL, SSE | обработка медиа, прокси тела файла, `new Worker` |
| **worker** | очереди BullMQ, ffmpeg/sharp, запись статуса, pub/sub прогресса | HTTP, раздача статики |
| **web** | загрузка в хранилище, UI, одно SSE | знание имён очередей и Redis |

На сервере каждый процесс — отдельный контейнер/`command` того же образа backend для api и worker. Локально: `npm run dev` и `npm run dev:worker`.

## Состояние

| Где | Истина для | Не класть |
|---|---|---|
| MySQL | пользователи, активы, задачи, производные — всё, что переживает рестарт | прогресс каждый процент |
| Redis | очереди, cancel-флаги, канал прогресса | архив за месяц |
| MinIO / S3 | байты файлов | пути из имени пользователя |
| ФС воркера | временные файлы задачи | что-либо после `finally` |
| Браузер | очередь загрузок, access-токен в памяти, открытое SSE | refresh-токен в `localStorage` |

Прогресс только в Redis. В MySQL — смена статуса.

## Потоки

```
браузер --presign--> api --PUT--> хранилище
браузер --complete--> api --Queue.add--> Redis
worker --BRPOP--> Redis --скачать--> хранилище --ffmpeg/sharp--> хранилище
worker --статус--> MySQL
worker --pub прогресс--> Redis --sub--> api --SSE--> браузер
```

Одно SSE на вкладку (`GET /api/events`). Не poll раз в секунду с клиента. Не WebSocket: поток односторонний. Не EventSource на карточку — лимит HTTP/1.1 ~6 соединений на origin.

## Очереди

Разные типы работ — разные имена. Имя очереди общее для `Queue` (api) и `Worker` (worker), живёт в одном модуле констант.

| Очередь | Зачем отделять |
|---|---|
| `media:probe` | быстро, выше concurrency |
| `media:image` | CPU sharp |
| `media:video` | 1–2 ffmpeg, длинный таймаут |
| `notify` | лимиты Telegram |
| `cleanup` | по расписанию |

В `job.data` — маленький JSON (`assetId`, тип). Не буфер файла.

## Слои кода (потолок)

```
HTTP (routes)     → парсинг, auth-заголовок, статус ответа
Service (класс)   → квота, транзакция, постановка в очередь
Prisma            → из сервиса напрямую, без repository-обёртки
Queue (класс)     → add / remove / getJobCounts
Processor (класс) → работа воркера, чистая относительно Express
```

Новый код кладём в feature-модули (`modules/auth`, `features/library`). Учебный `buttonClick` / `bullMQjobs` в продуктовые модули не импортируем.

## Чего нет в фундаменте

- Слоёв `domain` / `application` / `infrastructure` и Inversify
- Второго ORM «на всякий случай»
- Обработки медиа внутри api
- Опроса `/api/jobs` с клиента по таймеру
