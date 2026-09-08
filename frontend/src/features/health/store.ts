import { create } from 'zustand';
import { API_URL } from '@/lib/api';

type Status = 'idle' | 'loading' | 'online' | 'offline';

export interface DepCheck {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  bucket?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  uptimeSeconds: number;
  timestamp: string;
  checks?: {
    mysql: DepCheck;
    redis: DepCheck;
    storage: DepCheck;
  };
}

interface HealthState {
  status: Status;
  data: HealthResponse | null;
  error: string | null;
  check: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  data: null,
  error: null,

  check: async () => {
    set({ status: 'loading', error: null });

    try {
      const response = await fetch(`${API_URL}/api/health`);
      const data = (await response.json()) as HealthResponse;

      if (!response.ok) {
        set({
          status: 'offline',
          data,
          error: 'Один из сервисов недоступен',
        });
        return;
      }

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
