import { create } from 'zustand';
import { sseClient } from '@/lib/sse';

export type JobCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
};

const emptyCounts: JobCounts = {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
};

interface EventsState {
  counts: JobCounts;
  connect: () => () => void;
  applyCounts: (counts: Partial<JobCounts> | undefined) => void;
}

function isCountsPayload(data: unknown): data is { counts?: Partial<JobCounts> } {
  return typeof data === 'object' && data !== null && 'counts' in data;
}

export const useEventsStore = create<EventsState>((set) => ({
  counts: emptyCounts,

  applyCounts: (counts) =>
    set({
      counts: {
        waiting: counts?.waiting ?? 0,
        active: counts?.active ?? 0,
        completed: counts?.completed ?? 0,
        failed: counts?.failed ?? 0,
      },
    }),

  connect: () =>
    sseClient.subscribe((data) => {
      if (!isCountsPayload(data)) return;
      useEventsStore.getState().applyCounts(data.counts);
    }),
}));
