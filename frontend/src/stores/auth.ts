import { create } from "zustand";
import {
  fetchMe,
  loginRequest,
  logoutRequest,
  registerRequest,
} from "@/features/auth/api";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
} from "@/features/auth/types";

export type AuthStatus = "unknown" | "guest" | "authed";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  pending: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

let bootstrapInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "unknown",
  pending: false,
  error: null,

  bootstrap: () => {
    bootstrapInFlight ??= fetchMe()
      .then((body) => {
        set({ user: body.user, status: "authed" });
      })
      .catch(() => {
        set({ user: null, status: "guest" });
      })
      .finally(() => {
        bootstrapInFlight = null;
      });

    return bootstrapInFlight;
  },

  login: async (input) => {
    set({ pending: true, error: null });

    try {
      const body = await loginRequest(input);
      set({ user: body.user, status: "authed", pending: false });
      return true;
    } catch (err) {
      set({ pending: false, error: message(err, "Не удалось войти") });
      return false;
    }
  },

  register: async (input) => {
    set({ pending: true, error: null });

    try {
      const body = await registerRequest(input);
      set({ user: body.user, status: "authed", pending: false });
      return true;
    } catch (err) {
      set({
        pending: false,
        error: message(err, "Не удалось зарегистрироваться"),
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await logoutRequest();
    } catch {}
    set({ user: null, status: "guest", error: null });
  },

  clearError: () => set({ error: null }),
}));
