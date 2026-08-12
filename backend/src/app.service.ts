import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { StorageService } from './storage/storage.service';

type Check = 'up' | 'down';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
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
    const [db, redis, almacenamiento] = await Promise.all([
      this.checkDb(),
      this.redis.ping().then((ok): Check => (ok ? 'up' : 'down')),
      this.checkAlmacenamiento(),
    ]);

    // El almacenamiento se REPORTA pero no decide la disponibilidad, y es
    // deliberado: sin él no se pueden subir fotos ni documentos, pero el
    // rastreo, las rutas, los cobros y las entregas siguen funcionando.
    // Meterlo en `ready` haría que un MinIO caído sacara del balanceador a un
    // backend que puede atender casi todo. Sale en `checks` para que se vea en
    // el tablero y se pueda avisar.
    const ready = db === 'up' && redis === 'up';
    return {
      status: ready ? 'ok' : 'degraded',
      ready,
      checks: { db, redis, almacenamiento },
      timestamp: new Date().toISOString(),
    };
  }

  // Tres respuestas, no dos: `sin-configurar` es un estado legítimo en local y
  // no debe pintarse igual que una avería, o el aviso se vuelve ruido y se
  // acaba ignorando el día que sí está roto.
  private async checkAlmacenamiento(): Promise<Check | 'sin-configurar'> {
    if (!this.storage.configurado()) return 'sin-configurar';
    return (await this.storage.disponible()) ? 'up' : 'down';
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
