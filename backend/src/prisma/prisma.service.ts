import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({ datasourceUrl: config.getOrThrow<string>('DATABASE_URL_APP') });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected (RLS app role)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Runs `cb` inside a transaction with the RLS tenant context set, so every
  // query is filtered by Postgres row-level security on `tenant_id`.
  async withTenant<T>(
    tenantId: string,
    cb: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return cb(tx);
    });
  }
}
