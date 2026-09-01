import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useUsersStore } from './store';

export function UsersCard() {
  const { users, loading, saving, error, fetchUsers, createUser } =
    useUsersStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

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
      setName('');
      setEmail('');
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
