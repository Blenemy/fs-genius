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
import { useHealthStore } from './store';

const statusLabel: Record<string, string> = {
  idle: 'не проверялось',
  loading: 'проверяю…',
  online: 'API доступен',
  offline: 'API недоступен',
};

export function HealthCard() {
  const { status, data, error, check } = useHealthStore();

  useEffect(() => {
    void check();
  }, [check]);

  const badgeVariant =
    status === 'online'
      ? 'default'
      : status === 'offline'
        ? 'destructive'
        : 'secondary';

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
