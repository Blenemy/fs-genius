import { spawn } from "node:child_process";

const MAX_CAPTURE = 64 * 1024;

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
};

function appendCapped(buf: string, chunk: string): string {
  const next = buf + chunk;
  return next.length > MAX_CAPTURE ? next.slice(next.length - MAX_CAPTURE) : next;
}

/** Spawn a binary with an argv array. Never pass `shell: true`. */
export function runProcess(
  bin: string,
  args: readonly string[],
  opts: RunProcessOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";

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
      if ("code" in err && err.code === "ENOENT") {
        reject(new ProcessError(`${bin} is not installed`, null, ""));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
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
