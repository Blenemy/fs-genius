import { Button } from "@/components/ui/button";
import { useTelegram } from "./useTelegram";

export function TelegramConnect() {
  const { linked, waiting, busy, error, connect, refresh, disconnect } = useTelegram();

  if (linked == null && !error) return null;

  return (
    <div className="flex items-center gap-2">
      {linked ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          title="Нажми, чтобы отключить"
          onClick={() => void disconnect()}
        >
          Telegram подключён
        </Button>
      ) : waiting ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          Проверить
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void connect()}>
          Подключить Telegram
        </Button>
      )}
      {error ? (
        <span className="text-destructive hidden max-w-48 truncate text-xs sm:inline" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
