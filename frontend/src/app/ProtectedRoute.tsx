import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Logo } from "@/components/brand";
import { useAuthStore } from "@/stores/auth";

function useBootstrappedStatus() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (status === "unknown") void bootstrap();
  }, [status, bootstrap]);

  return status;
}

function Splash() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <Logo className="animate-pulse" />
      <p className="text-muted-foreground font-mono text-xs tracking-wide">
        проверяю сессию…
      </p>
    </main>
  );
}

export function ProtectedRoute() {
  const status = useBootstrappedStatus();

  if (status === "unknown") return <Splash />;
  if (status === "guest") return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function GuestRoute() {
  const status = useBootstrappedStatus();

  if (status === "unknown") return <Splash />;
  if (status === "authed") return <Navigate to="/" replace />;
  return <Outlet />;
}
