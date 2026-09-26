import { apiJson } from "@/lib/api";

export function createCheckout() {
  return apiJson<{ url: string }>("/api/billing/checkout", { method: "POST" });
}
