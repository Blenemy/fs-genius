import { create } from 'zustand';
import { deleteAssetRequest, fetchAssetList } from './api';
import type { Asset } from './types';

interface LibraryState {
  assets: Asset[];
  loading: boolean;
  deletingId: string | null;
  error: string | null;
  fetchAssets: (opts?: { silent?: boolean }) => Promise<void>;
  applyAsset: (asset: Asset) => void;
  deleteAsset: (assetId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  assets: [],
  loading: false,
  deletingId: null,
  error: null,

  fetchAssets: async (opts) => {
    if (!opts?.silent) set({ loading: true, error: null });
    else set({ error: null });

    try {
      const body = await fetchAssetList();
      set({ assets: body.assets, loading: false });
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error ? err.message : 'Не удалось загрузить библиотеку',
      });
    }
  },

  applyAsset: (asset) => {
    const current = get().assets;
    const index = current.findIndex((row) => row.id === asset.id);
    if (index === -1) {
      set({ assets: [asset, ...current] });
      return;
    }

    const next = [...current];
    next[index] = { ...next[index], ...asset };
    set({ assets: next });
  },

  deleteAsset: async (assetId) => {
    set({ deletingId: assetId, error: null });

    try {
      await deleteAssetRequest(assetId);
      set({
        assets: get().assets.filter((asset) => asset.id !== assetId),
        deletingId: null,
      });
    } catch (err) {
      set({
        deletingId: null,
        error: err instanceof Error ? err.message : 'Не удалось удалить файл',
      });
    }
  },
}));
