import { create } from 'zustand';

/**
 * Временный стор для проверки, что база отвечает.
 * На M1 его место займёт authStore, а список пользователей закроется правами.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface ApiError {
  error?: { code: string; message: string };
}

interface UsersState {
  users: User[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  createUser: (input: { name: string; email: string }) => Promise<boolean>;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

/** Достаёт человекочитаемое сообщение из единого формата ошибок (§10). */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return body.error?.message ?? `Сервер ответил ${response.status}`;
  } catch {
    return `Сервер ответил ${response.status}`;
  }
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  loading: false,
  saving: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { users: User[] };
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
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) throw new Error(await readError(response));

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
