import { apiJson } from '@/lib/api';
import type { User } from './types';

export function fetchUserList() {
  return apiJson<{ users: User[] }>('/api/users');
}
