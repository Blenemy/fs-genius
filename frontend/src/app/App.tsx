import { useEffect } from 'react';
import { HealthCard } from '@/features/health/HealthCard';
import { UsersCard } from '@/features/users/UsersCard';
import { ReportCard } from '@/features/report/ReportCard';
import { QueueCard } from '@/features/learn-queue/QueueCard';
import { UploadCard } from '@/features/upload/UploadCard';
import { LibraryCard } from '@/features/library/LibraryCard';
import { useEventsStore } from '@/stores/events';
import { useUploadStore } from '@/features/upload/store';
import { useLibraryStore } from '@/features/library/store';

export function App() {
  const connect = useEventsStore((s) => s.connect);
  const uploadPhase = useUploadStore((s) => s.phase);
  const fetchAssets = useLibraryStore((s) => s.fetchAssets);

  useEffect(() => connect(), [connect]);

  useEffect(() => {
    if (uploadPhase === 'done') void fetchAssets();
  }, [uploadPhase, fetchAssets]);

  return (
    <main className="bg-background text-foreground min-h-svh p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Медиаконвейер
          </h1>
          <p className="text-muted-foreground text-sm">
            Каркас проекта Тест 2. Функционала пока нет — на странице только
            проверки того, что фронт, бэкенд и база видят друг друга.
          </p>
        </header>

        <UploadCard />
        <LibraryCard />
        <QueueCard />
        <HealthCard />
        <ReportCard />
        <UsersCard />
      </div>
    </main>
  );
}
