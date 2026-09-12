import { apiJson } from "@/lib/api";
import type { AuthResponse, LoginInput, RegisterInput } from "./types";

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function loginRequest(input: LoginInput) {
  return apiJson<AuthResponse>("/api/auth/login", jsonPost(input));
}

export function registerRequest(input: RegisterInput) {
  return apiJson<AuthResponse>("/api/auth/register", jsonPost(input));
}

export function logoutRequest() {
  return apiJson<{ ok: true }>("/api/auth/logout", jsonPost({}));
}

export function fetchMe() {
  return apiJson<AuthResponse>("/api/auth/me");
}
