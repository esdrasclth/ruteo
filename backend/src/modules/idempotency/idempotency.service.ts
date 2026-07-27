import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type BeginResult =
  | { state: 'new' }
  | { state: 'in_progress' }
  | { state: 'replay'; status: number; body: unknown }
  | { state: 'conflict' }; // same key, different endpoint

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  // Reserves the key for this request, or reports that it is already in flight
  // (in_progress) or completed (replay). Uniqueness on [tenantId, key] serializes
  // concurrent requests carrying the same key.
  async begin(
    tenantId: string,
    key: string,
    endpoint: string,
  ): Promise<BeginResult> {
    try {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.idempotencyKey.create({
          data: { tenantId, key, endpoint },
        }),
      );
      return { state: 'new' };
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      ) {
        throw err;
      }
    }

    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.idempotencyKey.findUnique({
        where: { tenantId_key: { tenantId, key } },
      }),
    );
    if (!existing) {
      // Row vanished between the failed insert and this read; treat as new.
      return { state: 'new' };
    }
    if (existing.endpoint !== endpoint) {
      return { state: 'conflict' };
    }
    if (existing.responseStatus == null) {
      return { state: 'in_progress' };
    }
    return {
      state: 'replay',
      status: existing.responseStatus,
      body: existing.responseBody,
    };
  }

  // Stores the final response so future requests with the same key replay it.
  // The body is normalized through JSON so Decimals/Dates match the wire format.
  async complete(
    tenantId: string,
    key: string,
    status: number,
    body: unknown,
  ) {
    const normalized = JSON.parse(JSON.stringify(body ?? null)) as
      | Prisma.InputJsonValue
      | null;
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.idempotencyKey.updateMany({
        where: { tenantId, key },
        data: {
          responseStatus: status,
          responseBody: normalized ?? Prisma.DbNull,
        },
      }),
    );
  }

  // Releases the reservation when the handler fails, so the client can retry.
  async release(tenantId: string, key: string) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.idempotencyKey.deleteMany({
        where: { tenantId, key, responseStatus: null },
      }),
    );
  }
}
