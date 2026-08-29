import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useHealthStore } from "@/store/health";
import { useUsersStore } from "@/store/users";
import { useReportStore } from "@/store/report";

const statusLabel: Record<string, string> = {
  idle: "не проверялось",
  loading: "проверяю…",
  online: "API доступен",
  offline: "API недоступен",
};

function HealthCard() {
  const { status, data, error, check } = useHealthStore();

  useEffect(() => {
    void check();
  }, [check]);

  const badgeVariant =
    status === "online"
      ? "default"
      : status === "offline"
        ? "destructive"
        : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Состояние сервисов</CardTitle>
        <CardDescription>Отвечает ли бэкенд по /api/health</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Бэкенд:</span>
          <Badge variant={badgeVariant}>{statusLabel[status]}</Badge>
        </div>

        {data && (
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button
          variant="outline"
          onClick={() => void check()}
          disabled={status === "loading"}
        >
          Проверить снова
        </Button>
      </CardContent>
    </Card>
  );
}

function UsersCard() {
  const { users, loading, saving, error, fetchUsers, createUser } =
    useUsersStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const created = await createUser({
      name: name.trim(),
      email: email.trim(),
    });
    if (created) {
      setName("");
      setEmail("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пользователи</CardTitle>
        <CardDescription>
          Запись читается и пишется в MySQL через Prisma. Если имя сохраняется и
          появляется в списке — база на сервере работает.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-3"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            maxLength={100}
            required
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Почта"
            required
          />
          <Button type="submit" disabled={saving}>
            {saving ? "Сохраняю…" : "Добавить"}
          </Button>
        </form>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Записей в базе: {users.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchUsers()}
              disabled={loading}
            >
              Обновить
            </Button>
          </div>

          {loading && users.length === 0 && (
            <p className="text-muted-foreground text-sm">Загружаю…</p>
          )}

          {!loading && users.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Пока никого. Добавь первого — это и будет проверкой базы.
            </p>
          )}

          <ul className="divide-border divide-y">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {user.email}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard() {
  const {
    runs,
    loading,
    error,
    total,
    cacheKey,
    lastBatch,
    fetchOnce,
    fetchMany,
    reset,
  } = useReportStore();

  const parallelRun = runs.slice(0, lastBatch);
  const coalesced =
    lastBatch > 1 &&
    parallelRun.every((run) => !run.cached) &&
    new Set(parallelRun.map((run) => run.tookMs)).size === 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Тяжёлый отчёт и кеш</CardTitle>
        <CardDescription>
          Первый запрос считается в MySQL, следующие приходят из Redis. Смотри
          на «сервер»: у ответа из кеша это время того давнего запроса к базе, а
          «браузер» показывает, сколько на самом деле ждал клиент. Склейку
          параллельных запросов браузер показывает плохо — он сам ограничивает
          число одновременных соединений к одному хосту; честная проверка идёт
          через curl.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void fetchOnce()} disabled={loading}>
            {loading ? "Считаю…" : "Запросить отчёт"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void fetchMany(10)}
            disabled={loading}
          >
            10 запросов разом
          </Button>
          <Button variant="ghost" onClick={reset} disabled={runs.length === 0}>
            Очистить
          </Button>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {total !== null && (
          <div className="text-muted-foreground space-y-1 text-sm">
            <p>Пользователей в выборке: {total}</p>
            <p className="truncate font-mono text-xs">{cacheKey}</p>
          </div>
        )}

        {coalesced && (
          <p className="text-muted-foreground text-sm">
            У всех {lastBatch} ответов одинаковое время сервера — значит запрос
            в базу был один, остальные к нему присоединились.
          </p>
        )}

        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Замеров пока нет. Нажми «Запросить отчёт» дважды: первый раз будет
            секунды, второй — миллисекунды.
          </p>
        ) : (
          <div className="space-y-1">
            <div className="text-muted-foreground grid grid-cols-3 gap-2 text-xs">
              <span>откуда</span>
              <span className="text-right">сервер</span>
              <span className="text-right">браузер</span>
            </div>

            <ul className="divide-border divide-y">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="grid grid-cols-3 gap-2 py-2 text-sm"
                >
                  <span>
                    <Badge variant={run.cached ? "default" : "secondary"}>
                      {run.cached ? "Redis" : "MySQL"}
                    </Badge>
                  </span>
                  <span className="text-right font-mono">{run.tookMs} мс</span>
                  <span className="text-right font-mono">{run.wallMs} мс</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function App() {
  return (
    <main className="bg-background text-foreground min-h-svh p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Медиаконвейер
          </h1>
          <p className="text-muted-foreground text-sm">
            Каркас проекта Тест 2. Функционала пока нет — на странице только
            проверки того, что фронт, бэкенд и база видят друг друга.
          </p>
        </header>

        <HealthCard />
        <ReportCard />
        <UsersCard />
      </div>
    </main>
  );
}

export default App;
