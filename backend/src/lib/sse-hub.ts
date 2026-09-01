import type { Response } from 'express';

/** Fan-out for one SSE path. Does not own HTTP headers or heartbeats. */
export class SseHub<T> {
  private readonly clients = new Set<Response>();

  get size(): number {
    return this.clients.size;
  }

  add(res: Response): void {
    this.clients.add(res);
  }

  remove(res: Response): void {
    this.clients.delete(res);
  }

  send(res: Response, data: T): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(data: T): void {
    for (const client of this.clients) {
      try {
        this.send(client, data);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
