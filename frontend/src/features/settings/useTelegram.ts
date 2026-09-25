import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createTelegramLink,
  getTelegramStatus,
  unlinkTelegram,
} from "./api";

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export function useTelegram() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTelegramStatus()
      .then((status) => {
        if (!cancelled) setLinked(status.linked);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(message(err, "Не вышло проверить Telegram"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createTelegramLink();
      window.open(url, "_blank", "noopener,noreferrer");
      setWaiting(true);
    } catch (err: unknown) {
      setError(message(err, "Не вышло открыть бота"));
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await getTelegramStatus();
      setLinked(status.linked);
      if (status.linked) setWaiting(false);
      else setError("Бот ещё не видит Start. Нажми его в Telegram и проверь снова.");
    } catch (err: unknown) {
      setError(message(err, "Не вышло проверить Telegram"));
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await unlinkTelegram();
      setLinked(status.linked);
      setWaiting(false);
    } catch (err: unknown) {
      setError(message(err, "Не вышло отключить Telegram"));
    } finally {
      setBusy(false);
    }
  }, []);

  return { linked, waiting, busy, error, connect, refresh, disconnect };
}
