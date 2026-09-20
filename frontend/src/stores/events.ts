import { create } from 'zustand';
import { sseClient } from '@/lib/sse';
import type { Asset } from '@/features/library/types';

export type MediaSseEvent =
  | { type: 'snapshot'; assets: Asset[] }
  | { type: 'asset'; asset: Asset };

function isSnapshot(data: unknown): data is { type: 'snapshot'; assets: Asset[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'snapshot' &&
    'assets' in data &&
    Array.isArray(data.assets)
  );
}

function isAssetEvent(data: unknown): data is { type: 'asset'; asset: Asset } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === 'asset' &&
    'asset' in data &&
    typeof data.asset === 'object' &&
    data.asset !== null
  );
}

interface EventsState {
  connect: (onEvent: (event: MediaSseEvent) => void) => () => void;
}

export const useEventsStore = create<EventsState>(() => ({
  connect: (onEvent) =>
    sseClient.subscribe((data) => {
      if (isSnapshot(data)) {
        onEvent(data);
        return;
      }
      if (isAssetEvent(data)) onEvent(data);
    }),
}));
