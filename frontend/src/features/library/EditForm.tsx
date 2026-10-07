import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLibraryStore } from "./store";
import { formatDuration, isVideoAsset, type Asset } from "./types";
import {
  IMAGE_ACTIONS,
  VIDEO_ACTIONS,
  formatClock,
  maskTimecode,
  parseTimecode,
  type ImageActionId,
  type VideoActionId,
} from "./presets";

export function EditForm({ asset }: { asset: Asset }) {
  const applyEdit = useLibraryStore((state) => state.applyEdit);
  const applying = useLibraryStore((state) => state.applyingId === asset.id);
  const video = isVideoAsset(asset);
  const actions = video ? VIDEO_ACTIONS : IMAGE_ACTIONS;
  const [preset, setPreset] = useState<ImageActionId | VideoActionId>(
    actions[0].id,
  );
  const fullMs = asset.durationMs ?? null;
  const [start, setStart] = useState("0:00");
  const [end, setEnd] = useState(() =>
    fullMs != null && fullMs > 0 ? formatClock(fullMs) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const selected = actions.some((action) => action.id === preset)
    ? preset
    : actions[0].id;

  async function onSubmit() {
    setError(null);
    if (selected === "trim") {
      const startMs = parseTimecode(start);
      const endMs = parseTimecode(end);
      if (startMs == null || endMs == null) {
        setError("Укажи начало и конец");
        return;
      }
      if (endMs - startMs < 500) {
        setError("Отрезок короче полсекунды");
        return;
      }
      if (
        asset.durationMs != null &&
        (startMs > asset.durationMs || endMs > asset.durationMs)
      ) {
        setError("Отрезок длиннее ролика");
        return;
      }
      try {
        await applyEdit(asset.id, { preset: "trim", startMs, endMs });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось запустить");
      }
      return;
    }

    try {
      await applyEdit(asset.id, { preset: selected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить");
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-wide uppercase">
        Что сделать
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={selected}
          disabled={applying}
          onValueChange={(value) =>
            setPreset(value as ImageActionId | VideoActionId)
          }
        >
          <SelectTrigger className="w-full min-w-0 flex-1" aria-label="Действие">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actions.map((action) => (
              <SelectItem key={action.id} value={action.id}>
                {action.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          className="shrink-0"
          disabled={applying}
          onClick={() => void onSubmit()}
        >
          {applying ? <Loader2 className="animate-spin" /> : null}
          Сделать
        </Button>
      </div>

      {video && selected === "trim" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TimecodeInput
            label="С"
            value={start}
            fallbackMs={0}
            maxMs={fullMs}
            disabled={applying}
            onChange={setStart}
          />
          <TimecodeInput
            label="До"
            value={end}
            fallbackMs={fullMs}
            maxMs={fullMs}
            disabled={applying}
            onChange={setEnd}
          />
        </div>
      )}

      <p className="text-muted-foreground mt-2 text-xs">
        {video
          ? selected === "trim"
            ? `Длина ролика ${formatDuration(asset.durationMs)}. Цифры вводятся подряд: 130 — это 1:30. Ролик заменится, вернуть прежний нельзя.`
            : "Ролик заменится, вернуть прежний нельзя."
          : "Результат заменяет прошлый. Превью и исходник остаются."}
        {!video &&
        (asset.sourceType?.includes("gif") || asset.contentType.includes("gif"))
          ? " Анимация станет одним кадром."
          : ""}
      </p>
      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
    </section>
  );
}

function TimecodeInput({
  label,
  value,
  fallbackMs,
  maxMs,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  fallbackMs: number | null;
  maxMs: number | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  function normalize() {
    const parsed = parseTimecode(value) ?? fallbackMs;
    if (parsed == null) return;
    const clamped = maxMs != null ? Math.min(parsed, maxMs) : parsed;
    onChange(formatClock(clamped));
  }

  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
        {label}
      </span>
      <Input
        value={value}
        inputMode="numeric"
        placeholder="0:00"
        disabled={disabled}
        className="font-mono tabular-nums"
        onChange={(event) => onChange(maskTimecode(event.target.value))}
        onBlur={normalize}
        onFocus={(event) => event.target.select()}
      />
    </label>
  );
}
