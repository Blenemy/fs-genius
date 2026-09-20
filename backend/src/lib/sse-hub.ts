import type { Response } from "express";

/** Fan-out for one SSE path. Does not own HTTP headers or heartbeats. */
export class SseHub<T> {
  private readonly clients = new Map<string, Set<Response>>();

  add(key: string, res: Response): void {
    let group = this.clients.get(key);
    if (!group) {
      group = new Set();
      this.clients.set(key, group);
    }
    group.add(res);
  }

  remove(key: string, res: Response): void {
    const group = this.clients.get(key);
    if (!group) return;
    group.delete(res);
    if (group.size === 0) this.clients.delete(key);
  }

  send(res: Response, data: T): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  emit(key: string, data: T): void {
    const group = this.clients.get(key);
    if (!group) return;
    for (const client of group) {
      try {
        this.send(client, data);
      } catch {
        group.delete(client);
      }
    }
    if (group.size === 0) this.clients.delete(key);
  }
}
