# Frontend conventions

Читать вместе с [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Стек: React, Vite, TypeScript, Tailwind, shadcn/ui, Zustand, React Router. Ориентир: bulletproof-react (фичи, однонаправленные импорты, разделение клиентского и серверного состояния) плюс README §12.

Новый код — в структуру ниже. Каркас в `App.tsx` (health, users, учебная очередь) не копировать в фичи.

## Папки

```
frontend/src/
  app/                  # router, providers, корневой layout
  features/
    auth/
      components/
      api.ts
      types.ts
    library/
    upload/
    settings/
  components/ui/        # только shadcn: Button, Card, Progress…
  lib/
    api.ts              # fetch + refresh cookie
    sse.ts              # один EventSource
  stores/               # только глобальные сторы из таблицы ниже
  hooks/                # общие, не привязанные к фиче
  types/
```

Правила границ (как в bulletproof-react):

1. `components/ui` и `lib` ничего не знают о фичах
2. Фича не импортирует другую фичу
3. Сборка экранов — в `app/` (или корневом роутере)

Колокация: запрос, типы и компоненты одной фичи лежат рядом. Не раскладывать «все хуки в `/hooks`».

## Состояние

| Стор | Что хранит | Что не хранит |
|---|---|---|
| `authStore` | пользователь, access в памяти | refresh (cookie), список файлов |
| `uploadStore` | очередь PUT в хранилище: прогресс, отмена | статус обработки на сервере |
| `assetsStore` | страница библиотеки, фильтры; патч по SSE | сырой EventSource |
| `eventsStore` | одно SSE, reconnect, раздача подписчикам | бизнес-поля актива |

Zustand — клиент и сессия. Не складывать туда результат каждого GET, если его не патчит SSE. Не дублировать одно и то же в сторе и в локальном `useState` экрана без причины.

Токен доступа не в `localStorage`. Refresh только cookie `httpOnly`.

## Сеть и realtime

- В разработке все запросы на относительный `/api` (прокси Vite). `VITE_API_URL` — для продакшена, если origin другой
- Ошибки API: `{ error: { code, message } }` — на экране `message`, ветвление по `code`
- **Одно** `EventSource` на приложение (`lib/sse.ts` / `eventsStore`). Карточка подписывается на стор, не открывает свой поток
- Не опрашивать сервер по `setInterval`, чтобы «жива была цифра». Счётчики и прогресс приходят событием
- Загрузка файла: presign → PUT в хранилище → `complete`. Тело файла через api не гоняем

HTTP/1.1: ~6 соединений на origin. Лишний SSE на карточку забивает слоты и стопает обычный `fetch`.

## UI

- Примитивы — shadcn в `components/ui`. Стили фичи — Tailwind в её компонентах, не правкой `button.tsx`
- Статус задачи: цвет **и** форма (бейдж), не только текст
- Без перезагрузки страницы: ползёт прогресс, карточка переходит в ready, отмена показывает промежуточное «отменяется»
- После reload сторы и SSE восстанавливают картину с сервера (снимок при открытии потока)

Компоненты — функции. Классовых React-компонентов нет.

## Экран ↔ фича

| Экран | Фича |
|---|---|
| Вход / регистрация | `features/auth` |
| Библиотека | `features/library` |
| Drag-and-drop, прогресс PUT | `features/upload` |
| Карточка файла | `features/library` (деталь), не отдельный стор «на файл» |
| Настройки, Telegram, квота | `features/settings` |

## Не делать

- WebSocket «потому что realtime» — для прогресса достаточно SSE
- `EventSource` внутри карточки или кнопки
- Polling `GET` каждую секунду
- Импорт `@/features/auth` из `@/features/library`
- Класть access-токен в `localStorage`
- Тянуть учебную карточку очереди из `App.tsx` в продуктовые фичи
