import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Thin wrapper around a single ioredis connection. Deliberately fail-open:
// if Redis is unreachable, callers get null/undefined and the request path
// continues unthrottled rather than erroring.
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);
    const client = new Redis({
      host,
      port,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    client.on('error', (err) => {
      this.logger.warn(`Redis unavailable: ${err.message}`);
    });
    void client.connect().catch((err) => {
      this.logger.warn(`Redis initial connect failed: ${err.message}`);
    });
    this.client = client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  // Returns true if Redis answers PING, false otherwise. Never throws.
  async ping(): Promise<boolean> {
    if (!this.client || this.client.status !== 'ready') {
      return false;
    }
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  // Fixed-window counter. Returns the current hit count for the window, or
  // null if Redis is unavailable (caller should fail open).
  async incrementWindow(key: string, windowSeconds: number): Promise<number | null> {
    if (!this.client || this.client.status !== 'ready') {
      return null;
    }
    try {
      const result = await this.client
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .exec();
      const count = result?.[0]?.[1];
      return typeof count === 'number' ? count : Number(count);
    } catch (err) {
      this.logger.warn(
        `Redis increment failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
