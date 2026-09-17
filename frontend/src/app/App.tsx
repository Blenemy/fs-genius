import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UploadCard } from '@/features/upload/UploadCard';
import { LibraryCard } from '@/features/library/LibraryCard';
import { useEventsStore } from '@/stores/events';
import { useAuthStore } from '@/stores/auth';
import { useUploadStore } from '@/features/upload/store';
import { useLibraryStore } from '@/features/library/store';

const THUMB_READY_MS = 2500;

export function App() {
  const connect = useEventsStore((s) => s.connect);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const uploadPhase = useUploadStore((s) => s.phase);
  const fetchAssets = useLibraryStore((s) => s.fetchAssets);

  useEffect(() => connect(), [connect]);

  useEffect(() => {
    if (uploadPhase !== 'done') return;

    void fetchAssets({ silent: true });
    const timer = window.setTimeout(() => {
      void fetchAssets({ silent: true });
    }, THUMB_READY_MS);

    return () => window.clearTimeout(timer);
  }, [uploadPhase, fetchAssets]);

  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Медиаконвейер
            </h1>
            <p className="text-muted-foreground text-sm">
              Загрузи картинку — превью появится в библиотеке.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="text-muted-foreground hidden max-w-40 truncate text-sm sm:inline">
              {user?.name ?? user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Выйти
            </Button>
          </div>
        </header>

        <UploadCard />
        <LibraryCard />
        {/* Health, users, report, learn queue — keep files, hide from this screen. */}
      </div>
    </main>
  );
}
