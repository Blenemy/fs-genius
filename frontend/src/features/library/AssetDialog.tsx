import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  Download,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAssetDetail } from "./api";
import {
  ASSET_STATUS_LABEL,
  DERIV_LABEL,
  JOB_STATUS_LABEL,
  JOB_TYPE_LABEL,
  formatBitrate,
  formatBytes,
  formatDuration,
  formatPixels,
  isVideoAsset,
  playbackSrc,
  posterSrc,
  type Asset,
  type AssetDetail,
  type AssetStatus,
  type JobStatus,
} from "./types";

export function AssetDialog({
  asset,
  canceling,
  restarting,
  deleting,
  onClose,
  onCancel,
  onRestart,
  onDelete,
}: {
  asset: Asset;
  canceling: boolean;
  restarting: boolean;
  deleting: boolean;
  onClose: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onDelete: () => void;
}) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    setError(null);
    void fetchAssetDetail(asset.id)
      .then((body) => {
        if (!gone) setDetail(body.asset);
      })
      .catch((err: unknown) => {
        if (!gone) {
          setError(
            err instanceof Error ? err.message : "Не удалось открыть файл",
          );
        }
      });
    return () => {
      gone = true;
    };
  }, [asset.id, asset.status]);

  const view: Asset = detail
    ? {
        ...detail,
        ...asset,
        url: asset.url || detail.url,
        playbackUrl: asset.playbackUrl ?? detail.playbackUrl,
        width: asset.width ?? detail.width,
        height: asset.height ?? detail.height,
        durationMs: asset.durationMs ?? detail.durationMs,
        codec: asset.codec ?? detail.codec,
        bitrate: asset.bitrate ?? detail.bitrate,
        sizeBytes: asset.sizeBytes ?? detail.sizeBytes,
      }
    : asset;
  const video = isVideoAsset(view);
  const src = playbackSrc(view);
  const poster = posterSrc(view);
  const canPlay = view.status === "READY" && Boolean(src);
  const lastError = detail?.jobs.slice().reverse().find((job) => job.error)
    ?.error;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={view.originalName}
      onClick={onClose}
    >
      <div
        className="bg-card flex max-h-[min(92vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl ring-1 ring-foreground/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative bg-black">
          {canPlay ? (
            <video
              key={src ?? view.id}
              src={src ?? undefined}
              poster={poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full bg-black"
            />
          ) : poster ? (
            <img
              src={poster}
              alt={view.originalName}
              className="aspect-video w-full object-contain bg-black"
            />
          ) : video ? (
            <div className="text-muted-foreground grid aspect-video place-items-center px-6 text-center text-sm">
              Ролик ещё не готов к просмотру
            </div>
          ) : (
            <img
              src={view.url}
              alt={view.originalName}
              className="aspect-video w-full object-contain bg-black"
            />
          )}
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="truncate text-sm font-medium"
                title={view.originalName}
              >
                {view.originalName}
              </h2>
              <StatusBadge status={view.status} />
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-[0.7rem]">
              {[
                formatPixels(view.width, view.height),
                video ? formatDuration(view.durationMs) : null,
                view.codec,
                formatBytes(view.sizeBytes),
              ]
                .filter((part) => part && part !== "—")
                .join(" · ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть"
            autoFocus
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {view.status === "PROCESSING" && (
            <p className="text-muted-foreground text-sm">
              {canceling
                ? "Отменяется…"
                : typeof view.progress === "number"
                  ? `Обработка ${view.progress}%`
                  : "Обработка…"}
            </p>
          )}
          {view.status === "FAILED" && lastError && (
            <p className="text-destructive text-sm">{lastError}</p>
          )}
          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
          {!detail && !error && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Загрузка сведений
            </div>
          )}

          {detail && (
            <>
              <MetaGrid view={view} video={video} />

              <section>
                <h3 className="mb-2 text-xs font-medium tracking-wide uppercase">
                  Файлы
                </h3>
                <ul className="divide-border/60 divide-y rounded-xl ring-1 ring-foreground/10">
                  {detail.original && (
                    <FileRow
                      title="Оригинал"
                      hint={view.sourceType ?? view.contentType}
                      sizeBytes={detail.original.sizeBytes}
                      href={detail.original.downloadUrl}
                    />
                  )}
                  {detail.derivatives.map((item) => (
                    <FileRow
                      key={item.kind}
                      title={DERIV_LABEL[item.kind]}
                      hint={[
                        item.kind === "VIDEO_720P" || item.kind === "AUDIO_MP3"
                          ? null
                          : formatPixels(item.width, item.height),
                        item.mimeType.replace("image/", "").replace("video/", "").replace("audio/", ""),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      sizeBytes={item.sizeBytes}
                      href={item.downloadUrl}
                    />
                  ))}
                  {!detail.original && detail.derivatives.length === 0 && (
                    <li className="text-muted-foreground px-3 py-2.5 text-sm">
                      Файлов пока нет
                    </li>
                  )}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium tracking-wide uppercase">
                  Задачи
                </h3>
                <ol className="space-y-2">
                  {detail.jobs.length === 0 && (
                    <li className="text-muted-foreground text-sm">
                      История пуста
                    </li>
                  )}
                  {detail.jobs.map((job) => (
                    <li
                      key={job.id}
                      className="bg-muted/40 rounded-xl px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          {JOB_TYPE_LABEL[job.type]}
                        </span>
                        <Badge
                          variant={jobBadgeVariant(job.status)}
                          className="capitalize"
                        >
                          {JOB_STATUS_LABEL[job.status]}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 font-mono text-[0.65rem]">
                        {new Date(job.createdAt).toLocaleString("ru", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {job.attempts > 1 ? ` · попытка ${job.attempts}` : ""}
                      </p>
                      {job.error && (
                        <p className="text-destructive mt-1 text-xs">
                          {job.error}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
          {view.status === "PROCESSING" && (
            <Button
              variant="outline"
              disabled={canceling}
              onClick={onCancel}
            >
              {canceling ? <Loader2 className="animate-spin" /> : <Ban />}
              Отменить
            </Button>
          )}
          {(view.status === "CANCELED" || view.status === "FAILED") && (
            <Button
              variant="outline"
              disabled={restarting}
              onClick={onRestart}
            >
              {restarting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              Снова
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Удалить
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MetaGrid({ view, video }: { view: Asset; video: boolean }) {
  const rows: [string, string][] = [
    ["Тип", video ? "Видео" : "Изображение"],
    ["Размер кадра", formatPixels(view.width, view.height)],
    ...(video
      ? [
          ["Длительность", formatDuration(view.durationMs)] as [string, string],
          ["Битрейт", formatBitrate(view.bitrate)] as [string, string],
        ]
      : []),
    ["Кодек", view.codec ?? "—"],
    ["Вес", formatBytes(view.sizeBytes)],
    ["Формат", view.sourceType ?? view.contentType],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
            {label}
          </dt>
          <dd className="truncate font-mono text-xs" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FileRow({
  title,
  hint,
  sizeBytes,
  href,
}: {
  title: string;
  hint: string;
  sizeBytes: number;
  href: string;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <p className="text-muted-foreground truncate font-mono text-[0.65rem]">
          {hint}
          {hint ? " · " : ""}
          {formatBytes(sizeBytes)}
        </p>
      </div>
      <Button variant="ghost" size="sm" asChild>
        <a href={href} rel="noreferrer">
          <Download />
          Скачать
        </a>
      </Button>
    </li>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const variant =
    status === "FAILED"
      ? "destructive"
      : status === "READY"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{ASSET_STATUS_LABEL[status]}</Badge>;
}

function jobBadgeVariant(status: JobStatus) {
  if (status === "FAILED") return "destructive" as const;
  if (status === "DONE") return "default" as const;
  return "secondary" as const;
}
