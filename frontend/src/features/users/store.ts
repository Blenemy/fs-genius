import { create } from 'zustand';
import type { User } from './types';
import { createUserRequest, fetchUserList } from './api';

interface UsersState {
  users: User[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  createUser: (input: { name: string; email: string }) => Promise<boolean>;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  loading: false,
  saving: false,
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

  createUser: async (input) => {
    set({ saving: true, error: null });

    try {
      await createUserRequest(input);
      set({ saving: false });
      await get().fetchUsers();
      return true;
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : 'Не удалось сохранить',
      });
      return false;
    }
  },
}));
