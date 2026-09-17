import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './types';
import { useUploadStore } from './store';

const phaseLabel: Record<string, string> = {
  idle: 'ожидание',
  presigning: 'готовлю ссылку',
  uploading: 'отправляю файл',
  completing: 'подтверждаю',
  done: 'готово',
  error: 'ошибка',
};

const accept = ALLOWED_IMAGE_TYPES.join(',');
const maxMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

export function UploadCard() {
  const {
    phase,
    file,
    fileName,
    previewUrl,
    progress,
    error,
    selectFile,
    start,
    reset,
  } = useUploadStore();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy =
    phase === 'presigning' || phase === 'uploading' || phase === 'completing';

  function onFiles(list: FileList | null) {
    const next = list?.[0];
    if (next) selectFile(next);
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Загрузка</CardTitle>
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
        <CardDescription>
          JPEG, PNG, WebP или GIF, до {maxMb} МБ. Файл уходит в хранилище
          напрямую, сервер только проверяет и делает превью.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <button
          type="button"
          disabled={busy}
          className={`w-full rounded-xl border border-dashed p-6 text-left transition-colors ${
            dragOver
              ? 'border-ring bg-muted'
              : 'border-border bg-muted/40 hover:bg-muted/70'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
          onClick={() => inputRef.current?.click()}
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
          <div className="flex items-center gap-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="size-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="bg-background text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-lg">
                <ImagePlus className="size-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {fileName ?? 'Перетащи сюда или нажми, чтобы выбрать'}
              </p>
              <p className="text-muted-foreground text-xs">
                {file
                  ? `${(file.size / 1024).toFixed(1)} КБ`
                  : 'Одно изображение за раз'}
              </p>
            </div>
          </div>
        </button>

        {(phase === 'uploading' ||
          phase === 'completing' ||
          phase === 'done') && (
          <div className="space-y-1">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {phase === 'done'
                ? 'Превью появится в библиотеке через пару секунд'
                : `${progress}%`}
            </p>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={() => void start()} disabled={busy || !file}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Загружаю…' : 'Загрузить'}
          </Button>
          <Button variant="outline" onClick={reset} disabled={busy}>
            Сбросить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
