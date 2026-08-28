import { create } from 'zustand';

/**
 * Заглушка-стор для проверки связи фронта с api.
 * Настоящие сторы (authStore, uploadStore, assetsStore, eventsStore)
 * появятся на этапах M1–M2 — см. README §12.
 */

type Status = 'idle' | 'loading' | 'online' | 'offline';

export interface HealthResponse {
  status: string;
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

interface HealthState {
  status: Status;
  data: HealthResponse | null;
  error: string | null;
  check: () => Promise<void>;
}

// В разработке идём через прокси Vite (/api → localhost:3000).
const API_URL = import.meta.env.VITE_API_URL ?? '';

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  data: null,
  error: null,

  check: async () => {
    set({ status: 'loading', error: null });

    try {
      const response = await fetch(`${API_URL}/api/health`);

      if (!response.ok) {
        throw new Error(`Сервер ответил ${response.status}`);
      }

      const data = (await response.json()) as HealthResponse;
      set({ status: 'online', data, error: null });
    } catch (err) {
      set({
        status: 'offline',
        data: null,
        error: err instanceof Error ? err.message : 'Неизвестная ошибка',
      });
    }
  },
}));
