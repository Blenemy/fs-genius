import { apiJson } from '@/lib/api';
import type { CompleteResponse, PresignRequest, PresignResponse } from './types';

export function presignUpload(input: PresignRequest) {
  return apiJson<PresignResponse>('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function completeUpload(assetId: string) {
  return apiJson<CompleteResponse>(`/api/uploads/${assetId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/** Direct PUT to MinIO. Not through /api — Express never sees the bytes. */
export function putToStorage(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`Хранилище ответило ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(
        new Error(
          'Не удалось загрузить в MinIO. Часто это CORS на бакете или битый presign URL.',
        ),
      );
    };

    xhr.send(file);
  });
}
