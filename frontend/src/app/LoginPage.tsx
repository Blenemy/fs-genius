import { AuthCard } from '@/features/auth/components/AuthCard';

export function LoginPage() {
  return (
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Медиаконвейер
          </h1>
          <p className="text-muted-foreground text-sm">
            Библиотека и загрузка доступны после входа.
          </p>
        </header>

        <AuthCard />
      </div>
    </main>
  );
}
