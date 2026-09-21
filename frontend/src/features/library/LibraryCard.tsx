import { useEffect, useState } from "react";
import { ImageOff, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLibraryStore } from "./store";
import { isVideoAsset, playbackSrc, posterSrc, type Asset } from "./types";
import { VideoDialog } from "./VideoDialog";

export function LibraryCard() {
  const { assets, loading, deletingId, error, fetchAssets, deleteAsset } =
    useLibraryStore();
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  const playing = playerId
    ? (assets.find((asset) => asset.id === playerId) ?? null)
    : null;

  useEffect(() => {
    if (playerId && !playing) setPlayerId(null);
  }, [playerId, playing]);

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
                  onPlay={() => setPlayerId(asset.id)}
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
      {playing && (
        <VideoDialog asset={playing} onClose={() => setPlayerId(null)} />
      )}
    </Card>
  );
}

function AssetFrame({
  asset,
  onPlay,
}: {
  asset: Asset;
  onPlay: () => void;
}) {
  const video = isVideoAsset(asset);
  const poster = posterSrc(asset);
  const canPlay = asset.status === "READY" && Boolean(playbackSrc(asset));
  const progress =
    asset.status === "PROCESSING" && typeof asset.progress === "number"
      ? Math.min(100, Math.max(0, asset.progress))
      : null;

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
      {asset.status === "PROCESSING" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-6 animate-spin text-white" />
            {progress !== null && (
              <span className="font-mono text-xs text-white">{progress}%</span>
            )}
          </div>
          {progress !== null && (
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
    </>
  );

  if (canPlay) {
    return (
      <button
        type="button"
        className={`${frameClass} ${interactiveClass}`}
        aria-label={`Смотреть ${asset.originalName}`}
        onClick={onPlay}
      >
        {media}
        {overlays}
      </button>
    );
  }

  if (video) {
    return (
      <div className={frameClass}>
        {media}
        {overlays}
      </div>
    );
  }

  return (
    <a
      href={asset.url}
      target="_blank"
      rel="noreferrer"
      className={`${frameClass} ${interactiveClass}`}
    >
      {media}
      {overlays}
    </a>
  );
}

function pluralFiles(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "файл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "файла";
  return "файлов";
}
