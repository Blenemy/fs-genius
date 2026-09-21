import { UnrecoverableError } from "bullmq";
import { ProcessError, runProcess } from "./run-process.js";
import { mediaBin } from "./media-bin.js";

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
  opts?: { onStdout?: (chunk: string) => void },
): Promise<void> {
  try {
    await runProcess(mediaBin("ffmpeg"), args, opts);
  } catch (err) {
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
