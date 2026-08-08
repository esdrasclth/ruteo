import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente de base de datos **sin RLS**, para la gestión de plataforma.
 *
 * Es la única pieza del sistema que puede ver datos de todas las empresas a la
 * vez, y por eso está sola en su propio archivo y en su propio módulo: para que
 * cualquiera que audite el proyecto pueda buscar quién la inyecta y tener la
 * lista completa en una sola búsqueda.
 *
 * **No se debe inyectar fuera de `PlatformModule`.** Todo lo que sirve a un
 * tenant usa `PrismaService`, que corre con el rol `ruteo_app`
 * (NOBYPASSRLS) y no puede salirse de su empresa ni por error de código.
 *
 * Usa `DATABASE_URL` (rol `ruteo`, dueño del esquema), que es el mismo que
 * aplica las migraciones.
 */
@Injectable()
export class PlatformPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(PlatformPrismaService.name);

  constructor(config: ConfigService) {
    super({ datasourceUrl: config.getOrThrow<string>('DATABASE_URL') });
  }

  async onModuleInit() {
    await this.$connect();
    this.log.warn(
      'Conexión de plataforma activa (sin RLS). Solo debe usarla PlatformModule.',
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
