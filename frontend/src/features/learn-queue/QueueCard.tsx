import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useEventsStore } from '@/stores/events';
import { enqueueLearnJob } from './api';

export function QueueCard() {
  const counts = useEventsStore((s) => s.counts);
  const applyCounts = useEventsStore((s) => s.applyCounts);
  const [pending, setPending] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const waiting = counts.waiting;
  const active = counts.active;
  const inFlight = waiting + active;

  async function enqueue() {
    setPending(true);
    setError(null);

    try {
      const body = await enqueueLearnJob();
      setIds(body.ids ?? []);
      applyCounts(body.counts);
    } catch (err) {
      setIds([]);
      setError(err instanceof Error ? err.message : 'Не удалось поставить задачу');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Очередь</CardTitle>
        <CardDescription>
          Кнопка бьёт в POST /api/jobs. Счётчик приходит по SSE (/api/events),
          когда очередь реально меняется — не опросом.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button onClick={() => void enqueue()} disabled={pending}>
          {pending ? 'Ставлю…' : 'Поставить задачу'}
        </Button>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <p className="text-muted-foreground text-sm">
          Сейчас в очереди / в работе: {inFlight}
          <span className="text-muted-foreground/80">
            {' '}
            (waiting {waiting}, active {active})
          </span>
        </p>

        {ids.length > 0 && (
          <p className="text-muted-foreground font-mono text-sm">
            последний id: {ids.join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
