import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

type Check = 'up' | 'down';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Liveness: the process is running and can serve requests. No dependency
  // checks — a k8s liveness probe should not restart the pod because Redis
  // blipped.
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Readiness: all dependencies needed to serve traffic are reachable.
  // Returns { ready, checks }; the controller maps !ready to HTTP 503.
  async readiness() {
    const [db, redis] = await Promise.all([
      this.checkDb(),
      this.redis.ping().then((ok): Check => (ok ? 'up' : 'down')),
    ]);
    const ready = db === 'up' && redis === 'up';
    return {
      status: ready ? 'ok' : 'degraded',
      ready,
      checks: { db, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<Check> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
