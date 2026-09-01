import { prisma, disconnectDb } from './prisma.js';
import { createRedis, getRedis, disconnectRedis } from './redis.js';
import { requestCoalescer } from './request-coalescer.js';
import { LearnQueue } from '../queues/learn.queue.js';
import { LearnService } from '../modules/learn/learn.service.js';
import { LearnEventsHub } from '../modules/learn/learn.events.js';
import { UsersService } from '../modules/users/users.service.js';

/** API process only. The worker process must not import this module. */
const learnProducerRedis = createRedis('learn-producer', 'queue');
const learnEventsRedis = createRedis('queue-events', 'queue');

export const learnQueue = new LearnQueue(learnProducerRedis);
export const learnEventsHub = new LearnEventsHub(learnQueue, learnEventsRedis);
export const learnService = new LearnService(learnQueue);

export const usersService = new UsersService(
  prisma,
  getRedis(),
  requestCoalescer,
);

export async function disconnectApi(): Promise<void> {
  await learnEventsHub.close();
  await learnQueue.close();

  try {
    await learnProducerRedis.quit();
  } catch {
    // already closed
  }

  try {
    await learnEventsRedis.quit();
  } catch {
    // already closed
  }

  await disconnectRedis();
  await disconnectDb();
}
