import { createRedis } from '../../lib/redis.js';
import { LearnQueue } from '../../queues/learn.queue.js';

/** One-shot CLI producer. The HTTP api uses LearnService instead. */
const connection = createRedis('learn-cli', 'queue');
const learnQueue = new LearnQueue(connection);

const job1 = await learnQueue.add({ foo: 'bar' });
const job2 = await learnQueue.add({ foo: 'baz' });

console.log('enqueued', job1.id, job2.id);

await learnQueue.close();
await connection.quit();
