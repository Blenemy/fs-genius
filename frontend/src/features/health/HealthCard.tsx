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
import { useHealthStore, type DepCheck } from './store';

const statusLabel: Record<string, string> = {
  idle: 'не проверялось',
  loading: 'проверяю…',
  online: 'API доступен',
  offline: 'API недоступен',
};

function checkBadge(check: DepCheck | undefined) {
  if (!check) return { label: 'нет данных', variant: 'secondary' as const };
  if (check.skipped) return { label: 'не настроено', variant: 'secondary' as const };
  if (check.ok) return { label: 'ок', variant: 'default' as const };
  return { label: check.error ?? 'ошибка', variant: 'destructive' as const };
}

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

  const mysql = checkBadge(data?.checks?.mysql);
  const redis = checkBadge(data?.checks?.redis);
  const storage = checkBadge(data?.checks?.storage);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Состояние сервисов</CardTitle>
        <CardDescription>
          MySQL, Redis и MinIO по /api/health
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Бэкенд:</span>
          <Badge variant={badgeVariant}>{statusLabel[status]}</Badge>
        </div>

        {data?.checks && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-20">MySQL</span>
              <Badge variant={mysql.variant}>{mysql.label}</Badge>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-20">Redis</span>
              <Badge variant={redis.variant}>{redis.label}</Badge>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-20">MinIO</span>
              <Badge variant={storage.variant}>
                {storage.label}
                {data.checks.storage.bucket
                  ? ` (${data.checks.storage.bucket})`
                  : ''}
              </Badge>
            </div>
          </div>
        )}

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
