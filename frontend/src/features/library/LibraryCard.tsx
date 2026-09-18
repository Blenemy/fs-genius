import { useEffect } from "react";
import { ImageOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLibraryStore } from "./store";

export function LibraryCard() {
  const { assets, loading, deletingId, error, fetchAssets, deleteAsset } =
    useLibraryStore();

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

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
              Пока пусто. Залей первую картинку выше.
            </p>
          </div>
        )}

        {assets.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <li key={asset.id} className="group relative">
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-muted ring-foreground/10 hover:ring-primary/50 block aspect-square overflow-hidden rounded-xl ring-1 transition-all duration-200"
                >
                  <img
                    src={asset.url}
                    alt={asset.originalName}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </a>

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
    </Card>
  );
}

function pluralFiles(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "файл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "файла";
  return "файлов";
}
