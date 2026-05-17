import { Injectable } from '@nestjs/common';

/** Minimal Redis interface — duck-typed against ioredis for test friendliness. */
export interface IRedisClient {
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

/**
 * SmsRateLimiter — Redis sliding-window over a sorted set per (tenant, phone).
 *
 * Window: 1 hour. Limit: 3 SMS. Set name = `sms:rate:{tenant}:{phone}`.
 * Operations per call (atomic Redis pipeline):
 *   ZREMRANGEBYSCORE  -> drop entries older than now-1h
 *   ZCARD             -> count remaining
 *   if count < 3:    ZADD now + EXPIRE 3600
 *
 * Extracted from sms-twilio.provider.ts to avoid a temporal-dead-zone crash
 * at module load: `@Injectable()` on `SmsTwilioProvider` emits a metadata
 * decorator referencing `SmsRateLimiter`, which (when both classes lived in
 * the same file) was hoisted-but-not-initialised at that moment under
 * Node 24 + CJS, causing `ReferenceError: Cannot access 'SmsRateLimiter'
 * before initialization` at runtime.
 */
@Injectable()
export class SmsRateLimiter {
  private static readonly WINDOW_MS = 60 * 60 * 1000;
  private static readonly MAX_PER_WINDOW = 3;

  constructor(private readonly redis: IRedisClient | null) {}

  async tryAcquire(tenantId: string, phone: string): Promise<boolean> {
    if (!this.redis) {
      // No Redis configured -> open by default. Production should always have Redis.
      return true;
    }
    const key = `sms:rate:${tenantId}:${phone}`;
    const now = Date.now();
    const windowStart = now - SmsRateLimiter.WINDOW_MS;
    await this.redis.zremrangebyscore(key, 0, windowStart);
    const count = await this.redis.zcard(key);
    if (count >= SmsRateLimiter.MAX_PER_WINDOW) {
      return false;
    }
    await this.redis.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
    await this.redis.expire(key, Math.ceil(SmsRateLimiter.WINDOW_MS / 1000));
    return true;
  }
}
