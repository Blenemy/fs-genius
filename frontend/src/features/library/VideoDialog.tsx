import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playbackSrc, posterSrc, type Asset } from "./types";

export function VideoDialog({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const src = playbackSrc(asset);
  const poster = posterSrc(asset);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={asset.originalName}
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-3xl overflow-hidden rounded-2xl ring-1 ring-foreground/10"
        onClick={(event) => event.stopPropagation()}
      >
        {src ? (
          <video
            src={src}
            poster={poster ?? undefined}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full bg-black"
          />
        ) : (
          <div className="text-muted-foreground grid aspect-video place-items-center bg-black px-6 text-center text-sm">
            Ролик ещё не готов к просмотру
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="truncate text-sm font-medium" title={asset.originalName}>
            {asset.originalName}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть"
            autoFocus
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
