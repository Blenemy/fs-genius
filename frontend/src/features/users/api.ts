import { apiJson } from '@/lib/api';
import type { User } from './types';

export function fetchUserList() {
  return apiJson<{ users: User[] }>('/api/users');
}

export function createUserRequest(input: { name: string; email: string }) {
  return apiJson<{ user: User }>('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
