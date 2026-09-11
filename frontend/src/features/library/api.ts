import { apiJson } from '@/lib/api';
import type { Asset } from './types';

export function fetchAssetList() {
  return apiJson<{ assets: Asset[] }>('/api/assets');
}

export function deleteAssetRequest(assetId: string) {
  return apiJson<{ ok: true }>(`/api/assets/${assetId}`, { method: 'DELETE' });
}
