import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./types";
import { useUploadStore, type UploadPhase } from "./store";

/** Подпись, точка-индикатор и её цвет — всё, чем фаза отличается на экране. */
const PHASES: Record<UploadPhase, { label: string; tone: string }> = {
  idle: { label: "ожидание", tone: "bg-muted-foreground" },
  presigning: { label: "готовлю ссылку", tone: "bg-primary animate-pulse" },
  uploading: { label: "отправляю файл", tone: "bg-primary animate-pulse" },
  completing: { label: "подтверждаю", tone: "bg-primary animate-pulse" },
  done: { label: "готово", tone: "bg-success" },
  error: { label: "ошибка", tone: "bg-destructive" },
};

const accept = ALLOWED_IMAGE_TYPES.join(",");
const maxMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

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
    phase === "presigning" || phase === "uploading" || phase === "completing";
  const showProgress = busy || phase === "done";
  const meta = PHASES[phase];

  function onFiles(list: FileList | null) {
    const next = list?.[0];
    if (next) selectFile(next);
  }

  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-medium">Загрузка</h2>
          <span className="text-muted-foreground flex items-center gap-2 font-mono text-[0.7rem] tracking-wide uppercase">
            <span className={cn("size-1.5 rounded-full", meta.tone)} />
            {meta.label}
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={busy}
          className={cn(
            "surface-grid group relative flex w-full items-center gap-4 overflow-hidden",
            "rounded-2xl border border-dashed p-5 text-left transition-all duration-200",
            dragOver
              ? "border-primary bg-primary/8 scale-[1.01]"
              : "border-border hover:border-foreground/25 hover:bg-muted/40",
            busy && "pointer-events-none opacity-60",
          )}
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
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="ring-foreground/10 size-18 shrink-0 rounded-xl object-cover ring-1"
            />
          ) : (
            <span
              className={cn(
                "grid size-18 shrink-0 place-items-center rounded-xl transition-colors",
                dragOver
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/80 text-muted-foreground group-hover:text-foreground",
              )}
            >
              <ImagePlus className="size-7" strokeWidth={1.6} />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-medium break-all">
              {fileName ?? "Перетащи картинку или нажми, чтобы выбрать"}
            </span>
            <span className="text-muted-foreground mt-1 block font-mono text-xs">
              {file ? formatSize(file.size) : `JPEG · PNG · WebP · GIF · до ${maxMb} МБ`}
            </span>
          </span>

          {file && !busy && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Убрать файл"
              className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 shrink-0 place-items-center rounded-lg transition-colors"
              onClick={(event) => {
                event.stopPropagation();
                reset();
              }}
            >
              <X className="size-4" />
            </span>
          )}
        </button>

        {showProgress && (
          <div className="space-y-2">
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  phase === "done" ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
              {phase === "done" ? (
                <>
                  <Check className="text-success size-3.5" />
                  превью появится в библиотеке через пару секунд
                </>
              ) : (
                `${progress}%`
              )}
            </p>
          </div>
        )}

        {error && (
          <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="lg"
            className="px-4"
            onClick={() => void start()}
            disabled={busy || !file}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "Загружаю…" : "Загрузить"}
          </Button>
          <Button variant="ghost" size="lg" onClick={reset} disabled={busy}>
            <RotateCcw />
            Сбросить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
