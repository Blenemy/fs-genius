import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { createCheckout } from "./api";

export function CheckoutCard() {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returned = params.get("checkout");

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
            Stripe вернул сюда после оплаты. Доступ в приложении появится, когда
            сервер примет вебхук.
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
