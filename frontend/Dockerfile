# ── Сборка ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL намеренно пустой: фронт и /api живут на одном происхождении,
# поэтому CORS не нужен. Переменные VITE_* вшиваются здесь, на этапе сборки,
# и в рантайме их поменять нельзя — только пересборкой.
RUN npm run build


# ── Рантайм ──────────────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
