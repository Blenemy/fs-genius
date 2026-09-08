import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './types';
import { useUploadStore } from './store';

const phaseLabel: Record<string, string> = {
  idle: 'ожидание',
  presigning: 'запрашиваю ссылку…',
  uploading: 'кладу в MinIO…',
  completing: 'подтверждаю…',
  done: 'готово',
  error: 'ошибка',
};

const accept = ALLOWED_IMAGE_TYPES.join(',');
const maxMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

export function UploadCard() {
  const { phase, file, fileName, progress, assetId, error, selectFile, start, reset } =
    useUploadStore();
  const [dragOver, setDragOver] = useState(false);

  const busy =
    phase === 'presigning' || phase === 'uploading' || phase === 'completing';

  function onFiles(list: FileList | null) {
    const next = list?.[0];
    if (next) selectFile(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Загрузка картинки</CardTitle>
        <CardDescription>
          Файл идёт в MinIO по временной ссылке, не через Express. JPEG / PNG /
          WebP / GIF, до {maxMb} МБ.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className={`rounded-lg border border-dashed p-6 text-center text-sm transition-colors ${
            dragOver
              ? 'border-ring bg-muted'
              : 'border-border bg-muted/40'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            onFiles(event.dataTransfer.files);
          }}
        >
          <p className="text-muted-foreground mb-3">
            Перетащи сюда или выбери файл
          </p>
          <Input
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Статус:</span>
          <Badge
            variant={
              phase === 'done'
                ? 'default'
                : phase === 'error'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {phaseLabel[phase]}
          </Badge>
        </div>

        {fileName && (
          <p className="text-sm">
            {fileName}
            {file ? ` · ${(file.size / 1024).toFixed(1)} КБ` : ''}
          </p>
        )}

        {(phase === 'uploading' || phase === 'completing' || phase === 'done') && (
          <div className="space-y-1">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">{progress}%</p>
          </div>
        )}

        {assetId && (
          <p className="text-muted-foreground font-mono text-xs">
            assetId: {assetId}
          </p>
        )}

        {phase === 'done' && (
          <p className="text-sm">
            Объект должен появиться в бакете media (консоль :9001).
          </p>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={() => void start()} disabled={busy || !file}>
            Загрузить
          </Button>
          <Button variant="outline" onClick={reset} disabled={busy}>
            Сбросить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
