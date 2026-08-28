# Один образ на api и воркер — различается только команда запуска.
# ffmpeg сюда НЕ ставится: он понадобится воркеру на этапе M3,
# и тогда для него заводится отдельный Dockerfile (README §3).

# ── Зависимости ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Prisma ищет openssl при старте CLI; в bookworm-slim его нет.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates     && rm -rf /var/lib/apt/lists/*

# Отдельным слоем, чтобы кеш не сбрасывался на каждой правке кода.
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# Здесь есть dev-зависимости, поэтому postinstall (prisma generate) отработает.
RUN npm ci


# ── Сборка ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate && npm run build


# ── Миграции ─────────────────────────────────────────────────────────────────
# Отдельная цель: у неё есть CLI prisma из dev-зависимостей, которого
# намеренно нет в рантайм-образе. Запускается одноразовым сервисом перед api.
FROM build AS migrate
WORKDIR /app
CMD ["npx", "prisma", "migrate", "deploy"]


# ── Рантайм ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Prisma ищет openssl при старте CLI; в bookworm-slim его нет.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates     && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# --ignore-scripts обязателен: postinstall зовёт prisma generate, а CLI лежит
# в devDependencies и сюда не попадает. Клиент уже сгенерирован в стадии build.
#
# Образ выходит около 900 МБ, и это не ошибка сборки: @prisma/client объявляет
# prisma и typescript своими peerDependencies, поэтому в package-lock.json они
# помечены как production, и --omit=dev их законно оставляет. Вместе с CLI
# приезжает Prisma Studio. Ужать можно позже, когда дойдут руки, — сейчас
# важнее, что образ собирается и работает.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

# Prisma-миграции гоняются отдельным сервисом, но схема нужна и здесь —
# на случай запуска CLI внутри контейнера.
COPY prisma ./prisma
COPY prisma.config.ts ./

USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
