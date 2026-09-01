import { apiJson } from '@/lib/api';
import type { JobCounts } from '@/stores/events';

export function enqueueLearnJob() {
  return apiJson<{ ids: string[]; counts: JobCounts }>('/api/jobs', {
    method: 'POST',
  });
}
