import { useEffect } from 'react';
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
      <CardHeader>
        <CardTitle>Библиотека</CardTitle>
        <CardDescription>
          Список из MySQL, картинки по временной ссылке из MinIO.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {assets.length} шт.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAssets()}
            disabled={loading}
          >
            Обновить
          </Button>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {loading && assets.length === 0 && (
          <p className="text-muted-foreground text-sm">Загружаю…</p>
        )}

        {!loading && assets.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Пока пусто. Залей картинку выше.
          </p>
        )}

        {assets.length > 0 && (
          <ul className="grid grid-cols-2 gap-3">
            {assets.map((asset) => (
              <li key={asset.id} className="space-y-1.5">
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-muted block overflow-hidden rounded-lg"
                >
                  <img
                    src={asset.url}
                    alt={asset.originalName}
                    className="aspect-square w-full object-cover"
                  />
                </a>
                <p className="truncate text-sm font-medium" title={asset.originalName}>
                  {asset.originalName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(asset.createdAt).toLocaleString('ru')}
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === asset.id}
                  onClick={() => void deleteAsset(asset.id)}
                >
                  {deletingId === asset.id ? 'Удаляю…' : 'Удалить'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
