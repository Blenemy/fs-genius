import { spawn, type ChildProcess } from "node:child_process";
import { JobCanceledError } from "../shared/cancel.js";

const MAX_CAPTURE = 64 * 1024;
const KILL_GRACE_MS = 10_000;

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export type RunProcessOptions = {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
};

function appendCapped(buf: string, chunk: string): string {
  const next = buf + chunk;
  return next.length > MAX_CAPTURE ? next.slice(next.length - MAX_CAPTURE) : next;
}

function forceKill(child: ChildProcess) {
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGKILL");
}

function requestStop(child: ChildProcess) {
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGTERM");
}

/** Spawn a binary with an argv array. Never pass `shell: true`. */
export function runProcess(
  bin: string,
  args: readonly string[],
  opts: RunProcessOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new JobCanceledError());
      return;
    }

    const child = spawn(bin, [...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let stopping = false;

    const killTimer = { id: null as ReturnType<typeof setTimeout> | null };

    const stop = () => {
      if (stopping) return;
      stopping = true;
      requestStop(child);
      killTimer.id = setTimeout(() => {
        forceKill(child);
      }, KILL_GRACE_MS);
    };

    const onAbort = () => stop();
    opts.signal?.addEventListener("abort", onAbort);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendCapped(stdout, chunk);
      opts.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = appendCapped(stderr, chunk);
      opts.onStderr?.(chunk);
    });

    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (killTimer.id) clearTimeout(killTimer.id);
      if ("code" in err && err.code === "ENOENT") {
        reject(new ProcessError(`${bin} is not installed`, null, ""));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (killTimer.id) clearTimeout(killTimer.id);
      if (opts.signal?.aborted || stopping) {
        reject(new JobCanceledError());
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new ProcessError(
          `${bin} exited with code ${code}`,
          code,
          stderr.trim(),
        ),
      );
    });
  });
}
