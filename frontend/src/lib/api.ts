export const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Ошибка API в формате README §10: `{ error: { code, message } }`.
 * На экране показываем `message`, ветвимся по `code` (CONVENTIONS.md:53).
 * Наследуется от Error, поэтому старый код с `err instanceof Error` цел.
 */
export class ApiError extends Error {
  // Поля объявлены отдельно: параметры-свойства конструктора запрещены
  // флагом erasableSyntaxOnly в tsconfig.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `Сервер ответил ${response.status}`,
    );
  } catch {
    return new ApiError(
      response.status,
      'UNKNOWN',
      `Сервер ответил ${response.status}`,
    );
  }
}

/**
 * Маршруты, для которых 401 — это ответ по существу, а не «протух токен».
 * Дёргать на них refresh бессмысленно, а на самом /refresh — ещё и рекурсия.
 */
const NO_REFRESH_RETRY = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
];

/**
 * Одно обновление сессии на всех. Две вкладки, StrictMode и три карточки,
 * одновременно получившие 401, порождают один POST /api/auth/refresh —
 * иначе сервер увидит несколько запросов с одним и тем же refresh-токеном
 * и примет это за кражу. Приём тот же, что в бэкендовском RequestCoalescer.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Токенов здесь нет и быть не может: обе куки httpOnly, JS их не видит.
 * `credentials: 'include'` нужен на случай, если VITE_API_URL укажет на
 * другой origin — на своём куки ушли бы и так.
 */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const send = () =>
    fetch(`${API_URL}${path}`, { credentials: 'include', ...init });

  const response = await send();
  if (response.status !== 401) return response;
  if (NO_REFRESH_RETRY.some((prefix) => path.startsWith(prefix))) {
    return response;
  }

  const refreshed = await refreshSession();
  if (!refreshed) return response;

  // Повтор безопасен: тело у нас всегда строка, а не поток, который
  // после первой отправки уже вычитан.
  return send();
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) throw await readApiError(response);

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
