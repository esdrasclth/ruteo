import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type BeginResult =
  | { state: 'new' }
  | { state: 'in_progress' }
  | { state: 'replay'; status: number; body: unknown }
  | { state: 'conflict' }; // same key, different endpoint

/**
 * Cuánto vive una clave.
 *
 * 24 h es lo que usa el resto del sector y cubre de sobra el caso real: un
 * cliente reintenta una petición fallida en segundos o minutos, no al día
 * siguiente. Guardarlas para siempre —que es lo que hacía— convierte la tabla
 * en un archivo de todas las respuestas que ha dado la API.
 */
const VIGENCIA_H = 24;

@Injectable()
export class IdempotencyService {
  private readonly log = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  private caducidad(): Date {
    return new Date(Date.now() + VIGENCIA_H * 60 * 60 * 1000);
  }

  /**
   * Borra las claves vencidas de todas las empresas. Devuelve cuántas.
   *
   * Va por una función `SECURITY DEFINER` y no por Prisma porque el rol de la
   * aplicación es NOBYPASSRLS: sin contexto de tenant, un `deleteMany` no
   * borraría absolutamente nada, y en silencio.
   */
  async purgarVencidas(): Promise<number> {
    const filas = await this.prisma.$queryRaw<
      { purgar_idempotencia: number }[]
    >`SELECT purgar_idempotencia()`;
    const borradas = filas[0]?.purgar_idempotencia ?? 0;
    if (borradas > 0) {
      this.log.log(`Purgadas ${borradas} claves de idempotencia vencidas`);
    }
    return borradas;
  }

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
          data: { tenantId, key, endpoint, expiresAt: this.caducidad() },
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

    // Vencida: la clave vuelve a estar libre. Se reutiliza la fila en vez de
    // borrarla y reinsertar, que abriría una carrera con otra petición que
    // llegue con la misma clave en ese hueco. No se espera a que pase la purga:
    // entre purga y purga, una clave caducada bloquearía a un cliente que la
    // reutiliza legítimamente.
    if (existing.expiresAt <= new Date()) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.idempotencyKey.update({
          where: { id: existing.id },
          data: {
            endpoint,
            responseStatus: null,
            responseBody: Prisma.DbNull,
            createdAt: new Date(),
            expiresAt: this.caducidad(),
          },
        }),
      );
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
  async complete(tenantId: string, key: string, status: number, body: unknown) {
    const normalized = JSON.parse(
      JSON.stringify(body ?? null),
    ) as Prisma.InputJsonValue | null;
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
