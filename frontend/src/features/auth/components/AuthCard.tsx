import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

type Mode = "login" | "register";

const MODES: { id: Mode; label: string }[] = [
  { id: "login", label: "Вход" },
  { id: "register", label: "Регистрация" },
];

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
    <Card className="[--card-spacing:--spacing(5)]">
      <CardContent className="space-y-5">
        {/* Сегментный переключатель: две равные половины вместо двух кнопок. */}
        <div
          role="tablist"
          className="bg-background/60 ring-foreground/5 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              onClick={() => switchTo(item.id)}
              className={cn(
                "focus-visible:ring-ring/50 rounded-lg py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-3",
                mode === item.id
                  ? "bg-secondary text-foreground shadow-sm ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/*
          Форма и сообщение об ошибке — один блок постоянной высоты: меняются
          обе части (у регистрации на поле больше, ошибка появляется и
          исчезает), и без этого карточка дёргается.

          Считаем по самому высокому случаю — регистрация с ошибкой:
          4 элемента h-10 + 3 зазора gap-2.5 = 190px, зазор gap-3 = 12px,
          строка ошибки min-h-9 = 36px. Итого 238px = 59.5 шага сетки.
          Поменяется состав полей — пересчитать.
        */}
        <div className="grid min-h-59.5 content-center gap-3">
          {mode === "login" ? <LoginForm /> : <RegisterForm />}

          {/*
            Слот рендерится всегда, даже пустым. aria-live озвучит появление
            текста — role="alert" тут не годится, он для элемента, который
            возникает в DOM.
          */}
          <p
            aria-live="polite"
            className={cn(
              "min-h-9 rounded-lg px-3 py-2 text-sm",
              error && "text-destructive bg-destructive/10",
            )}
          >
            {error}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
