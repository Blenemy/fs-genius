import { UnrecoverableError } from "bullmq";
import { ProcessError, runProcess } from "./run-process.js";
import { mediaBin } from "./media-bin.js";
import { JobCanceledError } from "../shared/cancel.js";
import type { VideoEditPreset } from "../shared/edits.js";

export function extractFrameArgs(
  input: string,
  output: string,
  seekSec: number,
): string[] {
  return [
    "-hide_banner",
    "-y",
    "-ss",
    seekSec.toFixed(3),
    "-i",
    input,
    "-frames:v",
    "1",
    "-an",
    output,
  ];
}

export function transcode720pArgs(
  input: string,
  output: string,
  hasAudio: boolean,
): string[] {
  const audio = hasAudio
    ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
    : ["-an"];

  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...audio,
    "-vf",
    "scale=-2:min(720\\,ih)",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    output,
  ];
}

/** Исходник уже годится как 720p (см. canRemuxTo720p): только перекладываем в mp4 с faststart. */
export function remux720pArgs(
  input: string,
  output: string,
  hasAudio: boolean,
): string[] {
  const audio = hasAudio ? ["-map", "0:a:0"] : ["-an"];

  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...audio,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    output,
  ];
}

export type VideoEditSpec =
  | { preset: Exclude<VideoEditPreset, "trim"> }
  | { preset: "trim"; startMs: number; endMs: number };

/**
 * Аргументы пресета. Фильтры зашиты здесь. Числа таймкода уже проверены
 * и печатаются как секунды с тремя знаками — сырой текст пользователя не входит.
 */
export function videoEditArgs(
  edit: VideoEditSpec,
  input: string,
  output: string,
  hasAudio: boolean,
): string[] {
  if (edit.preset === "mute") {
    return [
      "-hide_banner",
      "-y",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "copy",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      output,
    ];
  }

  const trim =
    edit.preset === "trim" ? trimWindow(edit.startMs, edit.endMs) : null;
  const filter = videoFilter(edit.preset);
  const audioFilter = edit.preset === "speed2x" ? "atempo=2.0" : null;
  const crf = edit.preset === "compress" ? "30" : "23";
  const audioBitrate = edit.preset === "compress" ? "96k" : "128k";

  return [
    "-hide_banner",
    "-y",
    ...(trim ? ["-ss", trim.start, "-to", trim.end] : []),
    "-i",
    input,
    "-map",
    "0:v:0",
    ...aacArgs(hasAudio, audioBitrate, audioFilter),
    ...(filter ? ["-vf", filter] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    crf,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    output,
  ];
}

function trimWindow(startMs: number, endMs: number): { start: string; end: string } {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    throw new UnrecoverableError("bad trim");
  }
  return {
    start: (startMs / 1000).toFixed(3),
    end: (endMs / 1000).toFixed(3),
  };
}

function videoFilter(preset: Exclude<VideoEditPreset, "mute">): string | null {
  switch (preset) {
    case "speed2x":
      return "setpts=0.5*PTS";
    case "grayscale":
      return "hue=s=0";
    case "contrast":
      return "eq=contrast=1.3:brightness=0.02";
    case "square":
      return "crop=min(iw\\,ih):min(iw\\,ih),scale=-2:min(720\\,ih)";
    case "compress":
      return "scale=-2:min(480\\,ih)";
    case "trim":
      return "scale=-2:min(720\\,ih)";
    default: {
      const neverPreset: never = preset;
      throw new UnrecoverableError(`unknown preset ${String(neverPreset)}`);
    }
  }
}

function aacArgs(
  hasAudio: boolean,
  bitrate: string,
  audioFilter: string | null,
): string[] {
  if (!hasAudio) return ["-an"];
  return [
    "-map",
    "0:a:0",
    ...(audioFilter ? ["-af", audioFilter] : []),
    "-c:a",
    "aac",
    "-b:a",
    bitrate,
    "-ac",
    "2",
  ];
}

export function extractMp3Args(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-b:a",
    "64k",
    output,
  ];
}

export async function runFfmpeg(
  args: readonly string[],
  opts?: { onStdout?: (chunk: string) => void; signal?: AbortSignal },
): Promise<void> {
  try {
    await runProcess(mediaBin("ffmpeg"), args, opts);
  } catch (err) {
    if (err instanceof JobCanceledError) throw err;
    if (err instanceof ProcessError && err.message.includes("not installed")) {
      throw new UnrecoverableError("ffmpeg is not installed");
    }
    const detail =
      err instanceof ProcessError && err.stderr
        ? err.stderr
        : err instanceof Error
          ? err.message
          : "ffmpeg failed";
    throw new UnrecoverableError(`ffmpeg failed: ${detail.slice(0, 400)}`);
  }
}

export function parseClockToMs(clock: string): number | null {
  const match = clock.trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

/** ffmpeg `-progress pipe:1` writes `out_time=HH:MM:SS.ssssss` lines. */
export function createFfmpegTimeParser(onMs: (ms: number) => void) {
  let rest = "";
  return (chunk: string) => {
    rest += chunk.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    let nl = rest.indexOf("\n");
    while (nl !== -1) {
      const line = rest.slice(0, nl).trim();
      rest = rest.slice(nl + 1);
      if (line.startsWith("out_time=")) {
        const ms = parseClockToMs(line.slice("out_time=".length));
        if (ms != null) onMs(ms);
      }
      nl = rest.indexOf("\n");
    }
  };
}
