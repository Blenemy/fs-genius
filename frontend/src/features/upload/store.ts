import { create } from 'zustand';
import { completeUpload, presignUpload, putToStorage } from './api';
import {
  contentTypeFor,
  formatBytes,
  mediaKindOf,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type MediaKind,
} from './types';

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
  kind: MediaKind | null;
  previewUrl: string | null;
  progress: number;
  assetId: string | null;
  error: string | null;
  selectFile: (file: File | null) => void;
  start: () => Promise<void>;
  reset: () => void;
}

function revokePreview(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function validateFile(file: File): string | null {
  const kind = mediaKindOf(file);
  if (!kind) {
    return `Нужна картинка (JPEG, PNG, WebP, GIF) или видео (MP4, MOV, WebM, MKV). Сейчас: ${file.type || 'неизвестно'}`;
  }
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return `Файл больше ${formatBytes(limit)}`;
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
  kind: null,
  previewUrl: null,
  progress: 0,
  assetId: null,
  error: null,

  selectFile: (file) => {
    revokePreview(get().previewUrl);

    if (!file) {
      set({
        file: null,
        fileName: null,
        kind: null,
        previewUrl: null,
        error: null,
        phase: 'idle',
        progress: 0,
        assetId: null,
      });
      return;
    }

    const kind = mediaKindOf(file);
    const problem = validateFile(file);
    if (problem || !kind) {
      set({
        file: null,
        fileName: file.name,
        kind: null,
        previewUrl: null,
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
      kind,
      previewUrl: URL.createObjectURL(file),
      error: null,
      phase: 'idle',
      progress: 0,
      assetId: null,
    });
  },

  start: async () => {
    const { file, phase } = get();
    if (!file) {
      set({ phase: 'error', error: 'Сначала выбери файл' });
      return;
    }
    if (phase === 'presigning' || phase === 'uploading' || phase === 'completing') {
      return;
    }

    try {
      set({ phase: 'presigning', error: null, progress: 0, assetId: null });

      const presign = await presignUpload({
        fileName: file.name,
        contentType: contentTypeFor(file),
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
    revokePreview(get().previewUrl);
    set({
      phase: 'idle',
      file: null,
      fileName: null,
      kind: null,
      previewUrl: null,
      progress: 0,
      assetId: null,
      error: null,
    });
  },
}));

