import { apiJson } from "@/lib/api";

export interface TelegramStatus {
  linked: boolean;
  muted: boolean;
}

export interface TelegramLink {
  url: string;
}

export function getTelegramStatus() {
  return apiJson<TelegramStatus>("/api/telegram/link");
}

export function createTelegramLink() {
  return apiJson<TelegramLink>("/api/telegram/link", { method: "POST" });
}

export function unlinkTelegram() {
  return apiJson<TelegramStatus>("/api/telegram/link", { method: "DELETE" });
}
