import { UnrecoverableError } from "bullmq";
import { ProcessError, runProcess } from "./run-process.js";
import { mediaBin } from "./media-bin.js";
import { JobCanceledError } from "../shared/cancel.js";

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
  pix_fmt?: string;
  channels?: number;
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

export async function probeVideoFile(
  filePath: string,
  signal?: AbortSignal,
): Promise<VideoProbeMeta> {
  let stdout: string;
  try {
    const result = await runProcess(
      mediaBin("ffprobe"),
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { signal },
    );
    stdout = result.stdout;
  } catch (err) {
    if (err instanceof JobCanceledError) throw err;
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

export async function fileHasAudio(
  filePath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const { stdout } = await runProcess(
      mediaBin("ffprobe"),
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { signal },
    );
    return stdout.trim().length > 0;
  } catch (err) {
    if (err instanceof JobCanceledError) throw err;
    return false;
  }
}

/**
 * Выше этого битрейта исходник перекодируем, даже если он уже 720p:
 * запись экрана или камера на 30+ Мбит/с — слишком тяжёлый файл для просмотра.
 * crf 23 veryfast даёт на 720p обычно 2–4 Мбит/с.
 */
const REMUX_MAX_BITRATE = 5_000_000;

/**
 * Можно ли собрать video_720p без перекодирования (-c copy).
 * Условия те же, что гарантирует transcode720pArgs: H.264 yuv420p не выше 720
 * по кодированной высоте (scale смотрит на ih), звук AAC не больше двух каналов.
 * Любая ошибка — false: пусть лучше перекодирует, чем отдаст неиграющий файл.
 */
export async function canRemuxTo720p(
  filePath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  let parsed: FfprobeJson;
  try {
    const { stdout } = await runProcess(
      mediaBin("ffprobe"),
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { signal },
    );
    parsed = JSON.parse(stdout) as FfprobeJson;
  } catch (err) {
    if (err instanceof JobCanceledError) throw err;
    return false;
  }

  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const bitrate = Number.parseInt(parsed.format?.bit_rate ?? "", 10);

  const videoOk =
    video?.codec_name === "h264" &&
    video.pix_fmt === "yuv420p" &&
    !!video.height &&
    video.height <= 720;
  const audioOk =
    !audio || (audio.codec_name === "aac" && (audio.channels ?? 0) <= 2);
  const bitrateOk = Number.isFinite(bitrate) && bitrate <= REMUX_MAX_BITRATE;

  return videoOk && audioOk && bitrateOk;
}

function readRotation(stream: FfprobeStream): number {
  const tag = Number(stream.tags?.rotate ?? 0);
  if (Number.isFinite(tag) && tag !== 0) return tag;

  const side = stream.side_data_list?.find(
    (entry) => typeof entry.rotation === "number",
  );
  return side?.rotation ?? 0;
}
