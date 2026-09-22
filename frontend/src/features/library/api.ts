import { apiJson } from '@/lib/api';
import type { Asset, AssetDetail } from './types';

export function fetchAssetList() {
  return apiJson<{ assets: Asset[] }>('/api/assets');
}

export function fetchAssetDetail(assetId: string) {
  return apiJson<{ asset: AssetDetail }>(`/api/assets/${assetId}`);
}

export function cancelAssetRequest(assetId: string) {
  return apiJson<{ ok: true; pending: boolean }>(`/api/assets/${assetId}/cancel`, {
    method: 'POST',
  });
}

export function restartAssetRequest(assetId: string) {
  return apiJson<{ ok: true; status: 'PROCESSING' }>(
    `/api/assets/${assetId}/jobs`,
    { method: 'POST' },
  );
}

export function deleteAssetRequest(assetId: string) {
  return apiJson<{ ok: true }>(`/api/assets/${assetId}`, {
    method: 'DELETE',
  });
}
