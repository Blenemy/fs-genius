import { create } from 'zustand';
import type { User } from './types';
import { fetchUserList } from './api';

interface UsersState {
  users: User[];
  loading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  loading: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });

    try {
      const body = await fetchUserList();
      set({ users: body.users, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить список',
      });
    }
  },
}));
