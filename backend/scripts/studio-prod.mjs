/**
 * Открывает Prisma Studio на боевой базе через SSH-туннель.
 *
 *   npm run db:studio:prod
 *
 * Наружу порт MySQL не опубликован — он привязан к 127.0.0.1 на сервере.
 * Скрипт пробрасывает его к себе, забирает пароль из .env на сервере
 * (локально он нигде не хранится) и запускает Studio на отдельном порту,
 * чтобы её нельзя было спутать с локальной.
 */
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';

const SSH_HOST = 'mp';
const REMOTE_ENV = '/opt/fs-genius/.env';
const TUNNEL_PORT = 3307; // 3306 занят локальной базой для разработки
const STUDIO_PORT = 5556; // 5555 занят локальной Studio

/** Проверяет, слушает ли кто-то порт на localhost. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net
      .connect({ host: '127.0.0.1', port })
      .on('connect', () => {
        socket.end();
        resolve(true);
      })
      .on('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    if (await portInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Читает .env с сервера. Значения не печатаются. */
function readRemoteEnv() {
  const raw = execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_HOST, `cat ${REMOTE_ENV}`],
    { encoding: 'utf8' },
  );

  const values = {};
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

let tunnel = null;

async function main() {
  if (await portInUse(TUNNEL_PORT)) {
    console.log(`Туннель на ${TUNNEL_PORT} уже поднят — использую его.`);
  } else {
    console.log(`Поднимаю туннель ${TUNNEL_PORT} -> ${SSH_HOST}:3306 …`);
    tunnel = spawn(
      'ssh',
      ['-N', '-o', 'BatchMode=yes', '-L', `${TUNNEL_PORT}:127.0.0.1:3306`, SSH_HOST],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );

    if (!(await waitForPort(TUNNEL_PORT))) {
      console.error(
        `Не удалось поднять туннель. Проверь, что вход по ключу работает: ssh ${SSH_HOST}`,
      );
      shutdown(1);
      return;
    }
  }

  console.log('Читаю параметры подключения с сервера …');
  const env = readRemoteEnv();

  const user = env.MYSQL_USER ?? 'media';
  const database = env.MYSQL_DATABASE ?? 'media_pipeline';
  const password = env.MYSQL_PASSWORD;

  if (!password) {
    console.error(`В ${REMOTE_ENV} на сервере нет MYSQL_PASSWORD.`);
    shutdown(1);
    return;
  }

  // Пароль передаётся через окружение, а не аргументом — иначе он был бы
  // виден в списке процессов.
  const url =
    `mysql://${user}:${encodeURIComponent(password)}@127.0.0.1:${TUNNEL_PORT}` +
    `/${database}?allowPublicKeyRetrieval=true`;

  console.log(`\nБОЕВАЯ база. Studio: http://localhost:${STUDIO_PORT}`);
  console.log('Правки здесь меняют данные на сервере. Ctrl+C — выход.\n');

  const studio = spawn(
    'npx',
    ['prisma', 'studio', '--port', String(STUDIO_PORT)],
    { stdio: 'inherit', shell: true, env: { ...process.env, DATABASE_URL: url } },
  );

  studio.on('exit', (code) => shutdown(code ?? 0));
}

function shutdown(code) {
  if (tunnel && !tunnel.killed) tunnel.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
