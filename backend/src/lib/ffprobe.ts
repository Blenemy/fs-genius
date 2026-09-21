import { UnrecoverableError } from "bullmq";
import { ProcessError, runProcess } from "./run-process.js";
import { mediaBin } from "./media-bin.js";

/** README §13: 30 minutes. */
export const MAX_VIDEO_DURATION_MS = 30 * 60 * 1000;

export type VideoProbeMeta = {
  width: number;
  height: number;
  durationMs: number;
  codec: string;
  bitrate: number | null;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  bit_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};

type FfprobeJson = {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
};

export async function probeVideoFile(filePath: string): Promise<VideoProbeMeta> {
  let stdout: string;
  try {
    const result = await runProcess(mediaBin("ffprobe"), [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    stdout = result.stdout;
  } catch (err) {
    if (err instanceof ProcessError && err.message.includes("not installed")) {
      throw new UnrecoverableError("ffprobe is not installed");
    }
    const detail =
      err instanceof ProcessError && err.stderr
        ? err.stderr
        : err instanceof Error
          ? err.message
          : "ffprobe failed";
    throw new UnrecoverableError(`Unreadable video: ${detail.slice(0, 400)}`);
  }

  let parsed: FfprobeJson;
  try {
    parsed = JSON.parse(stdout) as FfprobeJson;
  } catch {
    throw new UnrecoverableError("ffprobe returned invalid JSON");
  }

  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  if (!video || !video.width || !video.height) {
    throw new UnrecoverableError("File has no video stream");
  }

  const durationSec = Number(
    parsed.format?.duration ?? video.duration ?? Number.NaN,
  );
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new UnrecoverableError("Video has no duration");
  }

  const durationMs = Math.round(durationSec * 1000);
  if (durationMs > MAX_VIDEO_DURATION_MS) {
    throw new UnrecoverableError("Video longer than 30 minutes");
  }

  const rotation = readRotation(video);
  const swapped = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;

  const bitrateRaw = parsed.format?.bit_rate ?? video.bit_rate;
  const bitrate = bitrateRaw ? Number.parseInt(bitrateRaw, 10) : Number.NaN;

  return {
    width: swapped ? video.height : video.width,
    height: swapped ? video.width : video.height,
    durationMs,
    codec: video.codec_name ?? "unknown",
    bitrate: Number.isFinite(bitrate) ? bitrate : null,
  };
}

export async function fileHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await runProcess(mediaBin("ffprobe"), [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function readRotation(stream: FfprobeStream): number {
  const tag = Number(stream.tags?.rotate ?? 0);
  if (Number.isFinite(tag) && tag !== 0) return tag;

  const side = stream.side_data_list?.find(
    (entry) => typeof entry.rotation === "number",
  );
  return side?.rotation ?? 0;
}
