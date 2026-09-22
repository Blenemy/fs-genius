import { create } from 'zustand';
import { cancelAssetRequest, deleteAssetRequest, fetchAssetList, restartAssetRequest } from './api';
import type { Asset } from './types';

interface LibraryState {
  assets: Asset[];
  loading: boolean;
  deletingId: string | null;
  cancelingId: string | null;
  restartingId: string | null;
  error: string | null;
  fetchAssets: (opts?: { silent?: boolean }) => Promise<void>;
  applyAsset: (asset: Asset) => void;
  deleteAsset: (assetId: string) => Promise<void>;
  cancelAsset: (assetId: string) => Promise<void>;
  restartAsset: (assetId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  assets: [],
  loading: false,
  deletingId: null,
  cancelingId: null,
  restartingId: null,
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
    const terminal =
      asset.status === 'CANCELED' ||
      asset.status === 'READY' ||
      asset.status === 'FAILED';
    set({
      assets: next,
      cancelingId:
        terminal && get().cancelingId === asset.id ? null : get().cancelingId,
    });
  },

  cancelAsset: async (assetId) => {
    set({ cancelingId: assetId, error: null });

    try {
      const result = await cancelAssetRequest(assetId);
      if (!result.pending) {
        const current = get().assets;
        set({
          assets: current.map((asset) =>
            asset.id === assetId ? { ...asset, status: 'CANCELED' } : asset,
          ),
          cancelingId: null,
        });
      }
    } catch (err) {
      set({
        cancelingId: null,
        error: err instanceof Error ? err.message : 'Не удалось отменить',
      });
    }
  },

  restartAsset: async (assetId) => {
    set({ restartingId: assetId, error: null });

    try {
      await restartAssetRequest(assetId);
      const current = get().assets;
      set({
        assets: current.map((asset) =>
          asset.id === assetId
            ? { ...asset, status: 'PROCESSING', progress: 0 }
            : asset,
        ),
        restartingId: null,
      });
    } catch (err) {
      set({
        restartingId: null,
        error: err instanceof Error ? err.message : 'Не удалось запустить снова',
      });
    }
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
