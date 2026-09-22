import { useEffect, useState } from "react";
import { Ban, ImageOff, Loader2, Play, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLibraryStore } from "./store";
import {
  formatDuration,
  isVideoAsset,
  posterSrc,
  type Asset,
} from "./types";
import { AssetDialog } from "./AssetDialog";

export function LibraryCard() {
  const {
    assets,
    loading,
    deletingId,
    cancelingId,
    restartingId,
    error,
    fetchAssets,
    deleteAsset,
    cancelAsset,
    restartAsset,
  } = useLibraryStore();
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  const opened = openId
    ? (assets.find((asset) => asset.id === openId) ?? null)
    : null;

  useEffect(() => {
    if (openId && !opened) setOpenId(null);
  }, [openId, opened]);

  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-heading text-base font-medium">Библиотека</h2>
            {assets.length > 0 && (
              <span className="text-muted-foreground font-mono text-xs">
                {assets.length} {pluralFiles(assets.length)}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAssets()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            Обновить
          </Button>
        </div>

        {error && (
          <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {loading && assets.length === 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <li
                key={i}
                className="bg-muted/60 aspect-square animate-pulse rounded-xl"
              />
            ))}
          </ul>
        )}

        {!loading && assets.length === 0 && (
          <div className="border-border/70 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
            <span className="bg-muted/70 text-muted-foreground grid size-12 place-items-center rounded-2xl">
              <ImageOff className="size-5" strokeWidth={1.6} />
            </span>
            <p className="text-muted-foreground text-sm">
              Пока пусто. Залей картинку или видео выше.
            </p>
          </div>
        )}

        {assets.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <li key={asset.id} className="group relative">
                <AssetFrame
                  asset={asset}
                  canceling={cancelingId === asset.id}
                  onOpen={() => setOpenId(asset.id)}
                />

                {/* Подпись поверх картинки: имя и дата не отнимают высоту у сетки. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-linear-to-t from-black/85 via-black/45 to-transparent px-2.5 pt-8 pb-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <p
                    className="truncate text-xs font-medium text-white"
                    title={asset.originalName}
                  >
                    {asset.originalName}
                  </p>
                  <p className="font-mono text-[0.65rem] text-white/65">
                    {new Date(asset.createdAt).toLocaleString("ru", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {asset.status === "PROCESSING" && (
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className={`absolute top-2 right-11 bg-black/55 text-white backdrop-blur-sm transition-opacity focus-visible:opacity-100 ${
                      cancelingId === asset.id
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    disabled={cancelingId === asset.id}
                    aria-label={`Отменить ${asset.originalName}`}
                    onClick={() => void cancelAsset(asset.id)}
                  >
                    {cancelingId === asset.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Ban />
                    )}
                  </Button>
                )}

                {(asset.status === "CANCELED" || asset.status === "FAILED") && (
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="absolute top-2 right-11 bg-black/55 text-white backdrop-blur-sm"
                    disabled={restartingId === asset.id}
                    aria-label={`Обработать снова ${asset.originalName}`}
                    onClick={() => void restartAsset(asset.id)}
                  >
                    {restartingId === asset.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="icon-sm"
                  className="absolute top-2 right-2 bg-black/55 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={deletingId === asset.id}
                  aria-label={`Удалить ${asset.originalName}`}
                  onClick={() => void deleteAsset(asset.id)}
                >
                  {deletingId === asset.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {opened && (
        <AssetDialog
          asset={opened}
          canceling={cancelingId === opened.id}
          restarting={restartingId === opened.id}
          deleting={deletingId === opened.id}
          onClose={() => setOpenId(null)}
          onCancel={() => void cancelAsset(opened.id)}
          onRestart={() => void restartAsset(opened.id)}
          onDelete={() => void deleteAsset(opened.id)}
        />
      )}
    </Card>
  );
}

function AssetFrame({
  asset,
  canceling,
  onOpen,
}: {
  asset: Asset;
  canceling: boolean;
  onOpen: () => void;
}) {
  const video = isVideoAsset(asset);
  const poster = posterSrc(asset);
  const progress =
    asset.status === "PROCESSING" && typeof asset.progress === "number"
      ? Math.min(100, Math.max(0, asset.progress))
      : null;
  const duration = video ? formatDuration(asset.durationMs) : null;

  const frameClass =
    "bg-muted ring-foreground/10 relative block aspect-square w-full overflow-hidden rounded-xl ring-1";
  const interactiveClass =
    "hover:ring-primary/50 cursor-pointer border-0 p-0 text-left transition-all duration-200";

  const media = poster ? (
    <img
      src={poster}
      alt={asset.originalName}
      loading="lazy"
      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  ) : video ? (
    <video
      src={asset.url}
      muted
      playsInline
      preload="metadata"
      className="pointer-events-none size-full bg-black object-cover"
    />
  ) : (
    <img
      src={asset.url}
      alt={asset.originalName}
      loading="lazy"
      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );

  const overlays = (
    <>
      {video && (
        <span className="pointer-events-none absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <Play className="size-3.5 fill-white" />
        </span>
      )}
      {duration && duration !== "—" && (
        <span className="pointer-events-none absolute top-2.5 left-11 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[0.65rem] text-white backdrop-blur-sm">
          {duration}
        </span>
      )}
      {asset.status === "PROCESSING" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-6 animate-spin text-white" />
            {canceling ? (
              <span className="text-xs text-white">Отменяется</span>
            ) : (
              progress !== null && (
                <span className="font-mono text-xs text-white">{progress}%</span>
              )
            )}
          </div>
          {progress !== null && !canceling && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
              <div
                className="bg-white h-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}
      {asset.status === "FAILED" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55 px-2 text-center">
          <p className="text-xs text-white">Не обработано</p>
        </div>
      )}
      {asset.status === "CANCELED" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55 px-2 text-center">
          <p className="text-xs text-white">Отменено</p>
        </div>
      )}
    </>
  );

  return (
    <button
      type="button"
      className={`${frameClass} ${interactiveClass}`}
      aria-label={`Открыть ${asset.originalName}`}
      onClick={onOpen}
    >
      {media}
      {overlays}
    </button>
  );
}

function pluralFiles(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "файл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "файла";
  return "файлов";
}
