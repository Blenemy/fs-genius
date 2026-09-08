import { create } from 'zustand';
import { completeUpload, presignUpload, putToStorage } from './api';
import { isAllowedImage, MAX_IMAGE_BYTES } from './types';

export type UploadPhase =
  | 'idle'
  | 'presigning'
  | 'uploading'
  | 'completing'
  | 'done'
  | 'error';

interface UploadState {
  phase: UploadPhase;
  file: File | null;
  fileName: string | null;
  progress: number;
  assetId: string | null;
  error: string | null;
  selectFile: (file: File | null) => void;
  start: () => Promise<void>;
  reset: () => void;
}

function validateImage(file: File): string | null {
  if (!isAllowedImage(file)) {
    return `Нужен JPEG, PNG, WebP или GIF. Сейчас: ${file.type || 'неизвестно'}`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Файл больше ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} МБ`;
  }
  if (file.size === 0) {
    return 'Пустой файл';
  }
  return null;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  phase: 'idle',
  file: null,
  fileName: null,
  progress: 0,
  assetId: null,
  error: null,

  selectFile: (file) => {
    if (!file) {
      set({
        file: null,
        fileName: null,
        error: null,
        phase: 'idle',
        progress: 0,
        assetId: null,
      });
      return;
    }

    const problem = validateImage(file);
    if (problem) {
      set({
        file: null,
        fileName: file.name,
        error: problem,
        phase: 'error',
        progress: 0,
        assetId: null,
      });
      return;
    }

    set({
      file,
      fileName: file.name,
      error: null,
      phase: 'idle',
      progress: 0,
      assetId: null,
    });
  },

  start: async () => {
    const { file, phase } = get();
    if (!file) {
      set({ phase: 'error', error: 'Сначала выбери картинку' });
      return;
    }
    if (phase === 'presigning' || phase === 'uploading' || phase === 'completing') {
      return;
    }

    try {
      set({ phase: 'presigning', error: null, progress: 0, assetId: null });

      const presign = await presignUpload({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });

      set({ phase: 'uploading', assetId: presign.assetId });

      await putToStorage(presign.uploadUrl, file, presign.headers, (percent) => {
        set({ progress: percent });
      });

      set({ phase: 'completing', progress: 100 });
      await completeUpload(presign.assetId);
      set({ phase: 'done' });
    } catch (err) {
      set({
        phase: 'error',
        error: err instanceof Error ? err.message : 'Неизвестная ошибка',
      });
    }
  },

  reset: () => {
    set({
      phase: 'idle',
      file: null,
      fileName: null,
      progress: 0,
      assetId: null,
      error: null,
    });
  },
}));

