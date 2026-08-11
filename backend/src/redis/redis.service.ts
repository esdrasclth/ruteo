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
    // Vacía en local (el contenedor arranca sin `--requirepass`) y obligatoria
    // en el VPS. Se omite la propiedad cuando no hay valor: pasarle `password:
    // ''` a ioredis manda un AUTH vacío y un Redis sin contraseña lo rechaza.
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    const client = new Redis({
      host,
      port,
      ...(password ? { password } : {}),
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

  // Cached JSON value, or null if missing / Redis down / payload corrupt.
  // Same fail-open contract as the rest of the wrapper: a cache miss and an
  // unreachable Redis are indistinguishable to the caller on purpose.
  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client || this.client.status !== 'ready') {
      return null;
    }
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis get failed: ${(err as Error).message}`);
      return null;
    }
  }

  // Best-effort write. A failed cache write must never fail the request.
  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client || this.client.status !== 'ready') {
      return;
    }
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis set failed: ${(err as Error).message}`);
    }
  }

  // Segundos que le quedan a una clave. `null` si Redis no responde o si la
  // clave no existe/no caduca, para que quien llame no distinga "no está" de
  // "no hay Redis" y trate ambos como "no bloqueado".
  async ttl(key: string): Promise<number | null> {
    if (!this.client || this.client.status !== 'ready') {
      return null;
    }
    try {
      const t = await this.client.ttl(key);
      return t > 0 ? t : null;
    } catch (err) {
      this.logger.warn(`Redis ttl failed: ${(err as Error).message}`);
      return null;
    }
  }

  // Lee y borra en la MISMA operación. Es lo que hace de un valor un vale de un
  // solo uso: con `get` y `del` por separado, dos peticiones simultáneas leen
  // ambas antes de que ninguna borre y las dos lo dan por bueno.
  //
  // Va por `eval` y no por `GETDEL` porque `GETDEL` es de Redis 6.2 en adelante
  // y aquí la versión la fija la imagen del compose, que puede cambiar sin que
  // nadie mire esto. Un script Lua es atómico en cualquier versión.
  async takeJson<T>(key: string): Promise<T | null> {
    if (!this.client || this.client.status !== 'ready') {
      return null;
    }
    try {
      const raw = (await this.client.eval(
        "local v = redis.call('GET', KEYS[1]) " +
          "if v then redis.call('DEL', KEYS[1]) end " +
          'return v',
        1,
        key,
      )) as string | null;
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis take failed: ${(err as Error).message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || this.client.status !== 'ready') {
      return;
    }
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Redis del failed: ${(err as Error).message}`);
    }
  }

  // Fixed-window counter. Returns the current hit count for the window, or
  // null if Redis is unavailable (caller should fail open).
  async incrementWindow(
    key: string,
    windowSeconds: number,
  ): Promise<number | null> {
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
      this.logger.warn(`Redis increment failed: ${(err as Error).message}`);
      return null;
    }
  }
}
