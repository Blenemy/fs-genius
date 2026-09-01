import { create } from 'zustand';
import { apiJson } from '@/lib/api';

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

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  data: null,
  error: null,

  check: async () => {
    set({ status: 'loading', error: null });

    try {
      const data = await apiJson<HealthResponse>('/api/health');
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
