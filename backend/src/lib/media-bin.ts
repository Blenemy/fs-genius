import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const cache = new Map<string, string>();

export function mediaBin(name: "ffmpeg" | "ffprobe"): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const resolved = resolveBin(name);
  cache.set(name, resolved);
  return resolved;
}

function resolveBin(name: "ffmpeg" | "ffprobe"): string {
  const fromEnv = name === "ffmpeg" ? env.FFMPEG_PATH : env.FFPROBE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const exe = process.platform === "win32" ? `${name}.exe` : name;
  for (const dir of pathDirs()) {
    const candidate = path.join(dir, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return exe;
}

function pathDirs(): string[] {
  const raw = process.env.PATH ?? "";
  const parts = raw.includes(";") ? raw.split(";") : raw.split(":");
  return parts.filter(Boolean).map(toNativeDir);
}

/** Git Bash PATH uses `/c/Users/...`. Windows spawn() needs `C:\Users\...`. */
function toNativeDir(dir: string): string {
  if (process.platform !== "win32") return dir;
  const msys = dir.match(/^\/([a-zA-Z])\/(.*)$/);
  if (msys?.[1] && msys[2] != null) {
    return `${msys[1].toUpperCase()}:\\${msys[2].replaceAll("/", "\\")}`;
  }
  return dir;
}
