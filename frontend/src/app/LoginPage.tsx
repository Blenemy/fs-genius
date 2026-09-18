import { Logo } from "@/components/brand";
import { AuthCard } from "@/features/auth/components/AuthCard";

export function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <div className="relative w-full max-w-sm">
        <header className="mb-7 flex flex-col items-center text-center">
          <Logo className="size-12 rounded-2xl [&_svg]:size-6" />
          <h1 className="font-heading mt-4 text-2xl font-semibold tracking-tight">
            Медиаконвейер
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm text-balance">
            Загрузка и библиотека доступны после входа.
          </p>
        </header>

        <AuthCard />

        <p className="text-muted-foreground/70 mt-6 text-center font-mono text-[0.7rem]">
          httpOnly cookies · argon2id · refresh rotation
        </p>
      </div>
    </main>
  );
}
