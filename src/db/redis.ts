import IORedis from 'ioredis';
import { config } from '../config.js';

export const redis = new IORedis.default(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err: Error) => {
  console.error('Redis error:', err.message);
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}

export default redis;
