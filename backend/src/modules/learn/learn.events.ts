import type { Request, Response } from 'express';
import { QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import { SseHub } from '../../lib/sse-hub.js';
import { QUEUE_NAMES } from '../../shared/queue-names.js';
import type { JobCounts } from '../../shared/jobs.js';
import type { LearnQueue } from '../../queues/learn.queue.js';

const QUEUE_EVENTS = ['added', 'waiting', 'active', 'completed', 'failed', 'removed'] as const;

/** Sandbox SSE: current learn-queue counts. Product events will replace this hub. */
export class LearnEventsHub {
  private readonly hub = new SseHub<{ counts: JobCounts }>();
  private readonly queueEvents: QueueEvents;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly learnQueue: LearnQueue,
    eventsConnection: Redis,
  ) {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.learn, {
      connection: eventsConnection,
    });

    for (const event of QUEUE_EVENTS) {
      this.queueEvents.on(event, () => this.scheduleBroadcast());
    }
  }

  async subscribe(req: Request, res: Response): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    this.hub.add(res);
    this.hub.send(res, { counts: await this.learnQueue.getCounts() });

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.hub.remove(res);
    });
  }

  async close(): Promise<void> {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    await this.queueEvents.close();
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimer || this.hub.size === 0) return;

    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.learnQueue.getCounts().then((counts) => {
        this.hub.broadcast({ counts });
      });
    }, 50);
  }
}
