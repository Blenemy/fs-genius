import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useUsersStore } from './store';

export function UsersCard() {
  const { users, loading, error, fetchUsers } = useUsersStore();

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пользователи</CardTitle>
        <CardDescription>
          Список читается из MySQL через Prisma. Маршрут закрыт ролью ADMIN;
          завести пользователя можно только через регистрацию.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
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
              Пусто — либо в базе никого, либо у тебя нет роли ADMIN.
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
