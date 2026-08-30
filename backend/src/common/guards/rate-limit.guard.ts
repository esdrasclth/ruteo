import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { API_KEY_HEADER } from './api-key.guard';
import type { AuthUser } from '../decorators/current-user.decorator';

interface RateLimitedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

interface RateLimitResponse {
  setHeader(nombre: string, valor: string | number): void;
}

// Fixed-window rate limiter scoped per tenant + caller identity. Runs after
// the auth guard so `request.user` is populated. Fails open when Redis is
// unavailable so a Redis outage never blocks the API.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const user = request.user;
    if (!user) {
      return true;
    }

    const identity = this.resolveIdentity(request, user);
    const windowStart = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `rl:${user.tenantId}:${identity}:${windowStart}`;

    const count = await this.redis.incrementWindow(key, options.windowSeconds);
    if (count === null) {
      return true; // fail open
    }

    const response = context.switchToHttp().getResponse<RateLimitResponse>();
    const remaining = Math.max(0, options.limit - count);
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', remaining);

    if (count > options.limit) {
      const retryAfter =
        (windowStart + 1) * options.windowSeconds -
        Math.floor(Date.now() / 1000);
      response.setHeader('Retry-After', Math.max(1, retryAfter));
      throw new HttpException(
        'Límite de solicitudes excedido. Intenta más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveIdentity(request: RateLimitedRequest, user: AuthUser): string {
    const raw = request.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof apiKey === 'string' && apiKey.startsWith('rk_')) {
      const prefix = apiKey.split('_')[1];
      if (prefix) {
        return `key:${prefix}`;
      }
    }
    if (user.userId) {
      return `user:${user.userId}`;
    }
    return 'anon';
  }
}
