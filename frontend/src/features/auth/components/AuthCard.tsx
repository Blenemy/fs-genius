import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

type Mode = "login" | "register";

export function AuthCard() {
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const [mode, setMode] = useState<Mode>("login");

  function switchTo(next: Mode) {
    if (next === mode) return;
    clearError();
    setMode(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "login" ? "Вход" : "Регистрация"}</CardTitle>
        <CardDescription>
          Токены приходят двумя куками httpOnly — в JS они недоступны, в
          localStorage не попадают.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === "login" ? "default" : "ghost"}
            size="sm"
            onClick={() => switchTo("login")}
          >
            Вход
          </Button>
          <Button
            variant={mode === "register" ? "default" : "ghost"}
            size="sm"
            onClick={() => switchTo("register")}
          >
            Регистрация
          </Button>
        </div>

        {mode === "login" ? <LoginForm /> : <RegisterForm />}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}
