import { create } from 'zustand';
import type { ReportRun } from './types';
import { requestReport } from './api';

interface ReportState {
  runs: ReportRun[];
  loading: boolean;
  error: string | null;
  total: number | null;
  cacheKey: string | null;
  lastBatch: number;
  fetchOnce: () => Promise<void>;
  fetchMany: (count: number) => Promise<void>;
  reset: () => void;
}

let nextRunId = 1;

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

  fetchMany: async (count) => {
    set({ loading: true, error: null });

    try {
      const results = await Promise.all(
        Array.from({ length: count }, () => requestReport()),
      );
      const first = results[0];
      if (!first) {
        set({ loading: false });
        return;
      }

      set((state) => ({
        loading: false,
        lastBatch: count,
        total: first.body.total,
        cacheKey: first.body.cacheKey,
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
