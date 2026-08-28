import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useHealthStore } from '@/store/health';

const statusLabel: Record<string, string> = {
  idle: 'не проверялось',
  loading: 'проверяю…',
  online: 'API доступен',
  offline: 'API недоступен',
};

function App() {
  const { status, data, error, check } = useHealthStore();

  useEffect(() => {
    void check();
  }, [check]);

  const badgeVariant =
    status === 'online' ? 'default' : status === 'offline' ? 'destructive' : 'secondary';

  return (
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Медиаконвейер</CardTitle>
          <CardDescription>
            Каркас проекта. Функционал ещё не реализован — это проверка того,
            что фронт и бэкенд поднимаются и видят друг друга.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">Состояние бэкенда:</span>
            <Badge variant={badgeVariant}>{statusLabel[status]}</Badge>
          </div>

          {data && (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}

          {error && (
            <p className="text-destructive text-sm">
              {error}. Запущен ли бэкенд на :3000?
            </p>
          )}

          <Button onClick={() => void check()} disabled={status === 'loading'}>
            Проверить снова
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
