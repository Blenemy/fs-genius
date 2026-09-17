import { useEffect } from 'react';
import { ImageOff, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useLibraryStore } from './store';

export function LibraryCard() {
  const { assets, loading, deletingId, error, fetchAssets, deleteAsset } =
    useLibraryStore();

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Библиотека</CardTitle>
            <CardDescription>
              {assets.length === 0
                ? 'Здесь появятся загруженные картинки'
                : `${assets.length} ${pluralFiles(assets.length)}`}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAssets()}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Обновить'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {loading && assets.length === 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="bg-muted aspect-square animate-pulse rounded-xl"
              />
            ))}
          </div>
        )}

        {!loading && assets.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <ImageOff className="size-8 opacity-50" />
            <p>Пока пусто. Залей картинку выше.</p>
          </div>
        )}

        {assets.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.map((asset) => (
              <li key={asset.id} className="group space-y-1.5">
                <div className="relative overflow-hidden rounded-xl">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-muted block"
                  >
                    <img
                      src={asset.url}
                      alt={asset.originalName}
                      className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                  </a>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    className="absolute top-2 right-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
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
                </div>
                <p
                  className="truncate text-sm font-medium"
                  title={asset.originalName}
                >
                  {asset.originalName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(asset.createdAt).toLocaleString('ru', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
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
  if (mod10 === 1 && mod100 !== 11) return 'файл';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'файла';
  return 'файлов';
}
