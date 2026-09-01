import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useReportStore } from './store';

export function ReportCard() {
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
            {loading ? 'Считаю…' : 'Запросить отчёт'}
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
                    <Badge variant={run.cached ? 'default' : 'secondary'}>
                      {run.cached ? 'Redis' : 'MySQL'}
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
