import { apiJson } from "@/lib/api";

export interface BillingState {
  plan: "FREE" | "PRO" | "ENTERPRISE";
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

export function getBilling() {
  return apiJson<BillingState>("/api/billing/subscription");
}

export function createCheckout() {
  return apiJson<{ url: string }>("/api/billing/checkout", { method: "POST" });
}
