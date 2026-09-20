import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand";
import { UploadCard } from "@/features/upload/UploadCard";
import { LibraryCard } from "@/features/library/LibraryCard";
import { useAuthStore } from "@/stores/auth";
import { useUploadStore } from "@/features/upload/store";
import { useLibraryStore } from "@/features/library/store";

const THUMB_READY_MS = 2500;

export function App() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const uploadPhase = useUploadStore((s) => s.phase);
  const fetchAssets = useLibraryStore((s) => s.fetchAssets);

  useEffect(() => {
    if (uploadPhase !== "done") return;

    void fetchAssets({ silent: true });
    const timer = window.setTimeout(() => {
      void fetchAssets({ silent: true });
    }, THUMB_READY_MS);

    return () => window.clearTimeout(timer);
  }, [uploadPhase, fetchAssets]);

  const initials = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-svh">
      {/* Липкая шапка с размытием: галерея уезжает под неё, а не обрывается. */}
      <header className="bg-background/70 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />

          <div className="flex items-center gap-2">
            <div className="bg-card/60 hidden items-center gap-2.5 rounded-full py-1 pr-3 pl-1 ring-1 ring-foreground/10 sm:flex">
              <span className="bg-muted text-foreground grid size-7 place-items-center rounded-full text-xs font-semibold">
                {initials}
              </span>
              <span className="max-w-40 truncate text-xs font-medium">
                {user?.name ?? user?.email}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Выйти"
              title="Выйти"
              onClick={() => void logout()}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-10 pb-20 sm:px-6">
        <div className="mb-9 max-w-xl">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Загрузи картинку —{" "}
            <span className="text-primary">превью соберётся само</span>
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Файл уходит в хранилище напрямую, минуя сервер. Дальше его
            подхватывает воркер и делает миниатюру и превью.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <UploadCard />
          <LibraryCard />
        </div>
      </main>
    </div>
  );
}
