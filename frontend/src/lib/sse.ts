import { API_URL } from './api';

type MessageHandler = (data: unknown) => void;

/**
 * One EventSource for the whole app. HTTP/1.1 allows ~6 connections per origin;
 * opening a stream per card would stall fetch.
 */
class SseClient {
  private source: EventSource | null = null;
  private readonly handlers = new Set<MessageHandler>();

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    this.ensureOpen();
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.close();
    };
  }

  private ensureOpen() {
    if (this.source) return;

    this.source = new EventSource(`${API_URL}/api/events`);
    this.source.onmessage = (event) => {
      try {
        const data: unknown = JSON.parse(event.data);
        for (const handler of this.handlers) handler(data);
      } catch {
        // Ignore a malformed frame; the next event will resync.
      }
    };
  }

  private close() {
    this.source?.close();
    this.source = null;
  }
}

export const sseClient = new SseClient();
