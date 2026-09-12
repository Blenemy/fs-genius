import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
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
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center">
      <p className="text-muted-foreground text-sm">Проверяю сессию…</p>
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
