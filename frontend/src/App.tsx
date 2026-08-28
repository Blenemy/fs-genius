import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useHealthStore } from '@/store/health';
import { useUsersStore } from '@/store/users';

const statusLabel: Record<string, string> = {
  idle: 'не проверялось',
  loading: 'проверяю…',
  online: 'API доступен',
  offline: 'API недоступен',
};

function HealthCard() {
  const { status, data, error, check } = useHealthStore();

  useEffect(() => {
    void check();
  }, [check]);

  const badgeVariant =
    status === 'online' ? 'default' : status === 'offline' ? 'destructive' : 'secondary';

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
          disabled={status === 'loading'}
        >
          Проверить снова
        </Button>
      </CardContent>
    </Card>
  );
}

function UsersCard() {
  const { users, loading, saving, error, fetchUsers, createUser } = useUsersStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const created = await createUser({ name: name.trim(), email: email.trim() });
    if (created) {
      setName('');
      setEmail('');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пользователи</CardTitle>
        <CardDescription>
          Запись читается и пишется в MySQL через Prisma. Если имя сохраняется
          и появляется в списке — база на сервере работает.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
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
            {saving ? 'Сохраняю…' : 'Добавить'}
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
              <li key={user.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-sm">{user.email}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function App() {
  return (
    <main className="bg-background text-foreground min-h-svh p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Медиаконвейер</h1>
          <p className="text-muted-foreground text-sm">
            Каркас проекта. Функционала пока нет — на странице только проверки
            того, что фронт, бэкенд и база видят друг друга.
          </p>
        </header>

        <HealthCard />
        <UsersCard />
      </div>
    </main>
  );
}

export default App;
