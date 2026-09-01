import { API_URL } from '@/lib/api';
import type { ReportResponse } from './types';

const REPORT_QUERY = 'days=365&limit=20';

export async function requestReport(): Promise<{
  body: ReportResponse;
  wallMs: number;
}> {
  const startedAt = performance.now();
  const response = await fetch(`${API_URL}/api/users/report?${REPORT_QUERY}`);
  const wallMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status}`);
  }

  return { body: (await response.json()) as ReportResponse, wallMs };
}
