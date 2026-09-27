import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { createCheckout, getBilling, type BillingState } from "./api";

function formatPeriod(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isPro(billing: BillingState): boolean {
  if (billing.plan === "PRO") return true;
  const status = billing.subscription?.status;
  return status === "active" || status === "trialing";
}

export function CheckoutCard() {
  const [params] = useSearchParams();
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returned = params.get("checkout");

  useEffect(() => {
    let cancelled = false;
    getBilling()
      .then((state) => {
        if (!cancelled) setBilling(state);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : "Не вышло узнать тариф",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createCheckout();
      window.location.assign(url);
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Не вышло открыть оплату");
    }
  }

  if (!billing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подписка</CardTitle>
          <CardDescription>
            {loadError ?? "Проверяю тариф…"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (billing.plan === "ENTERPRISE") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подписка Enterprise</CardTitle>
          <CardDescription>Тариф уже назначен этому аккаунту.</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge>Enterprise</Badge>
        </CardContent>
      </Card>
    );
  }

  if (isPro(billing)) {
    const until = formatPeriod(billing.subscription?.currentPeriodEnd ?? null);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подписка Pro</CardTitle>
          <CardDescription>
            {until ? `Активна до ${until}.` : "Тариф Pro уже оплачен."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge>Pro</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Подписка Pro</CardTitle>
        <CardDescription>
          Кнопка просит сервер создать Checkout. Карту принимаешь на странице Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {returned === "success" ? (
          <p className="text-sm">
            Stripe вернул сюда после оплаты. Если тариф ещё Free, обнови
            страницу: вебхук мог прийти на секунду позже.
          </p>
        ) : null}
        {returned === "cancel" ? (
          <p className="text-muted-foreground text-sm">
            Оплату закрыли до списания.
          </p>
        ) : null}
        <Button disabled={busy} onClick={() => void start()}>
          {busy ? "Открываю Stripe…" : "Оформить подписку"}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
