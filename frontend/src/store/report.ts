import { create } from 'zustand';

/**
 * Стор для наблюдения за кешем тяжёлого отчёта.
 *
 * Смысл не в самих данных отчёта, а в двух числах рядом с ними: сколько
 * запрос занял на сервере и пришёл ли ответ из Redis. По ним видно и работу
 * кеша (первый запрос долгий, следующие мгновенные), и склейку параллельных
 * запросов (у всех одинаковый tookMs — значит вычисление было одно).
 */

export interface ReportResponse {
  cached: boolean;
  cacheKey: string;
  tookMs: number;
  total: number;
  limit: number;
  offset: number;
  rows: unknown[];
}

/** Один замер: что ответил сервер и сколько ждал браузер. */
export interface ReportRun {
  id: number;
  cached: boolean;
  tookMs: number;
  /** Время по часам браузера — включает сеть, в отличие от tookMs. */
  wallMs: number;
}

interface ReportState {
  runs: ReportRun[];
  loading: boolean;
  error: string | null;
  total: number | null;
  cacheKey: string | null;
  /** Сколько запросов ушло последним нажатием: по одиночному судить о склейке нельзя. */
  lastBatch: number;
  fetchOnce: () => Promise<void>;
  fetchMany: (count: number) => Promise<void>;
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

// Отчёт достаточно широкий, чтобы считаться долго: без фильтров и за год.
const REPORT_QUERY = 'days=365&limit=20';

let nextRunId = 1;

async function requestReport(): Promise<{ body: ReportResponse; wallMs: number }> {
  const startedAt = performance.now();
  const response = await fetch(`${API_URL}/api/users/report?${REPORT_QUERY}`);
  const wallMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status}`);
  }

  return { body: (await response.json()) as ReportResponse, wallMs };
}

export const useReportStore = create<ReportState>((set) => ({
  runs: [],
  loading: false,
  error: null,
  total: null,
  cacheKey: null,
  lastBatch: 0,

  fetchOnce: async () => {
    set({ loading: true, error: null });

    try {
      const { body, wallMs } = await requestReport();

      set((state) => ({
        loading: false,
        lastBatch: 1,
        total: body.total,
        cacheKey: body.cacheKey,
        runs: [
          { id: nextRunId++, cached: body.cached, tookMs: body.tookMs, wallMs },
          ...state.runs,
        ].slice(0, 20),
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось получить отчёт',
      });
    }
  },

  /**
   * Несколько запросов одновременно — проверка склейки. Если она работает,
   * все ответы придут с одним и тем же tookMs.
   */
  fetchMany: async (count) => {
    set({ loading: true, error: null });

    try {
      const results = await Promise.all(
        Array.from({ length: count }, () => requestReport()),
      );

      set((state) => ({
        loading: false,
        lastBatch: count,
        total: results[0].body.total,
        cacheKey: results[0].body.cacheKey,
        runs: [
          ...results.map(({ body, wallMs }) => ({
            id: nextRunId++,
            cached: body.cached,
            tookMs: body.tookMs,
            wallMs,
          })),
          ...state.runs,
        ].slice(0, 20),
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось получить отчёт',
      });
    }
  },

  reset: () =>
    set({ runs: [], error: null, total: null, cacheKey: null, lastBatch: 0 }),
}));
