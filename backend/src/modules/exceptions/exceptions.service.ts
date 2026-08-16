import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExceptionStatus,
  NotificationChannel,
  Prisma,
  ShipmentEventType,
} from '@prisma/client';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { registrar } from '../shipments/eventos';
import { AddExceptionFileDto } from './dto/add-exception-file.dto';
import {
  CreateExceptionDto,
  UpdateExceptionDto,
} from './dto/create-exception.dto';
import { QueryExceptionsDto } from './dto/query-exceptions.dto';

/**
 * Excepciones: lo que salió mal y hay que resolver.
 *
 * Que sean entidad y no estado es lo que permite que un envío esté a la vez «en
 * aduana» y «con documentación pendiente». Con el problema metido en
 * `ShipmentStatus` habría que elegir cuál de las dos contar, y la operación real
 * necesita las dos.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  private readonly detalle = {
    shipment: { select: { id: true, trackingNumber: true, status: true } },
    manifest: { select: { id: true, number: true } },
  } satisfies Prisma.ExceptionInclude;

  async create(tenantId: string, dto: CreateExceptionDto, userId?: string) {
    const excepcion = await this.crearEnTx(tenantId, dto, userId);
    await this.avisarAlAsignado(tenantId, excepcion);
    return excepcion;
  }

  private crearEnTx(
    tenantId: string,
    dto: CreateExceptionDto,
    userId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const excepcion = await tx.exception.create({
        data: { tenantId, ...dto, createdByUserId: userId },
        include: this.detalle,
      });

      // Solo si cuelga de un envío: una excepción puede nacer sin dueño
      // conocido —«hay una caja sin etiqueta»— y ahí no hay historial donde
      // escribirla todavía.
      if (excepcion.shipmentId) {
        await registrar(tx, {
          tenantId,
          shipmentId: excepcion.shipmentId,
          tipo: ShipmentEventType.EXCEPTION_OPENED,
          description: `Excepción abierta: ${excepcion.description}`,
          actorUserId: userId,
          metadata: {
            exceptionId: excepcion.id,
            type: excepcion.type,
            severity: excepcion.severity,
            expectedValue: excepcion.expectedValue,
            actualValue: excepcion.actualValue,
          },
        });
      }

      return excepcion;
    });
  }

  /**
   * Avisa a quien tiene que resolverla.
   *
   * Lo dejó pendiente la fase 2: una excepción aparecía en la bandeja y había
   * que ir a mirarla. El coste real no es la que nadie ve, es la que todos ven
   * y nadie coge; por eso el aviso va **al asignado** y no a una lista general.
   * Sin destinatario concreto, un correo a todo el mundo se convierte en el que
   * se archiva sin abrir.
   *
   * Al cliente NO se le avisa desde aquí a propósito. Una excepción es
   * diagnóstico interno —«faltan 2 bultos del manifiesto»— y avisarlo en
   * automático mandaría a medio padrón un mensaje sobre algo que puede
   * resolverse en una hora. Lo que sí se le cuenta es el reclamo, donde el
   * cliente es quien pregunta.
   *
   * Fire-and-forget: que no salga el aviso no puede tumbar el registro de la
   * excepción, que es lo que de verdad hay que conservar.
   */
  private async avisarAlAsignado(
    tenantId: string,
    excepcion: {
      id: string;
      assignedToUserId: string | null;
      description: string;
      shipmentId: string | null;
      severity: string;
    },
  ) {
    if (!excepcion.assignedToUserId) return;

    const usuario = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: excepcion.assignedToUserId! },
        select: { email: true, name: true },
      }),
    );
    if (!usuario?.email) return;

    this.notifications.dispatch(tenantId, {
      channel: NotificationChannel.EMAIL,
      recipient: usuario.email,
      type: 'exception.assigned',
      title: 'Tienes una excepción asignada',
      body: `Excepción ${excepcion.severity}: ${excepcion.description}`,
      shipmentId: excepcion.shipmentId,
    });
  }

  /**
   * Adjunta evidencia ya subida.
   *
   * El archivo se sube antes por su propio camino (`/files`) y aquí solo se
   * enlaza: subir y enlazar en la misma petición obligaría a que este endpoint
   * hablara multipart, y un fallo a mitad dejaría el objeto en el bucket sin
   * fila que lo apunte.
   */
  async addFile(
    tenantId: string,
    exceptionId: string,
    dto: AddExceptionFileDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const excepcion = await tx.exception.findUnique({
        where: { id: exceptionId },
        select: { id: true },
      });
      if (!excepcion) throw new NotFoundException('La excepción no existe');

      // El archivo se busca DENTRO del contexto del tenant, así que RLS ya
      // impide colgar de una excepción propia un archivo de otra empresa.
      const archivo = await tx.fileObject.findUnique({
        where: { id: dto.fileId },
        select: { id: true },
      });
      if (!archivo) throw new NotFoundException('El archivo no existe');

      return tx.exceptionFile.create({
        data: {
          tenantId,
          exceptionId,
          fileId: dto.fileId,
          notes: dto.notes,
        },
      });
    });
  }

  async listFiles(tenantId: string, exceptionId: string) {
    const filas = await this.prisma.withTenant(tenantId, (tx) =>
      tx.exceptionFile.findMany({
        where: { exceptionId },
        orderBy: { createdAt: 'asc' },
        include: { file: { select: { key: true, originalName: true } } },
      }),
    );

    // La URL se firma AL LEER y dura minutos. Guardarla sería dejar escrito un
    // pase que funciona sin sesión.
    return Promise.all(
      filas.map(async (fila) => ({
        id: fila.id,
        notes: fila.notes,
        createdAt: fila.createdAt,
        originalName: fila.file.originalName,
        // Que un archivo no se pueda firmar no debe tumbar la galería entera.
        url: await this.storage
          .firmarDescarga(fila.file.key, tenantId)
          .catch(() => null),
      })),
    );
  }

  // Paginado desde el principio: una operación con problemas genera excepciones
  // todos los días y la lista solo crece. Sin paginar, la pantalla que más se
  // mira sería la que primero se vuelve lenta.
  async list(tenantId: string, query: QueryExceptionsDto) {
    const where: Prisma.ExceptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      ...(query.manifestId ? { manifestId: query.manifestId } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.exception.count({ where }),
        tx.exception.findMany({
          where,
          // Las abiertas primero y las graves antes: es una bandeja de trabajo,
          // no un histórico. Ordenar solo por fecha dejaría un faltante grave de
          // ayer debajo de una diferencia de peso de hoy.
          orderBy: [
            { status: 'asc' },
            { severity: 'desc' },
            { createdAt: 'desc' },
          ],
          skip: saltar(query),
          take: query.pageSize,
          include: this.detalle,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  /** Cuántas hay sin cerrar, por severidad. Alimenta el tablero. */
  async resumen(tenantId: string) {
    const filas = await this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.groupBy({
        by: ['severity'],
        where: {
          status: { in: [ExceptionStatus.OPEN, ExceptionStatus.INVESTIGATING] },
        },
        _count: { _all: true },
      }),
    );
    return {
      abiertas: filas.reduce((n, f) => n + f._count._all, 0),
      porSeveridad: Object.fromEntries(
        filas.map((f) => [f.severity, f._count._all]),
      ),
    };
  }

  async findOne(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!fila) throw new NotFoundException('La excepción no existe');
    return fila;
  }

  async update(tenantId: string, id: string, dto: UpdateExceptionDto) {
    const actual = await this.findOne(tenantId, id);
    // Se compara con el asignado ANTERIOR para avisar solo cuando cambia de
    // manos. Avisar en cada `PATCH` mandaría un correo por cada cambio de
    // severidad al mismo que ya la tenía, y el aviso dejaría de leerse.
    const cambiaDeAsignado =
      dto.assignedToUserId !== undefined &&
      dto.assignedToUserId !== actual.assignedToUserId;

    const cierra =
      dto.status === ExceptionStatus.RESOLVED ||
      dto.status === ExceptionStatus.WRITTEN_OFF;

    // Cerrar exige decir qué se hizo. Sin esto, «resuelta» no distingue entre
    // se arregló y alguien se cansó de verla en la lista, y el histórico deja de
    // servir para entender qué pasa en la operación.
    if (cierra && !dto.resolution && !actual.resolution) {
      throw new BadRequestException(
        'Para cerrar una excepción hay que explicar cómo se resolvió.',
      );
    }

    const actualizada = await this.prisma.withTenant(tenantId, async (tx) => {
      const actualizada = await tx.exception.update({
        where: { id },
        data: {
          ...dto,
          // La fecha de cierre la pone el sistema, no quien llama: es un dato
          // de auditoría y no debe poder escribirse a mano.
          resolvedAt: cierra ? (actual.resolvedAt ?? new Date()) : null,
        },
        include: this.detalle,
      });

      // Solo al cerrar. Registrar cada cambio de severidad o de asignado
      // llenaría el historial del envío de ruido sobre quién movió una ficha.
      if (cierra && actualizada.shipmentId) {
        await registrar(tx, {
          tenantId,
          shipmentId: actualizada.shipmentId,
          tipo: ShipmentEventType.EXCEPTION_RESOLVED,
          description:
            `Excepción cerrada: ${actualizada.resolution ?? ''}`.trim(),
          metadata: {
            exceptionId: actualizada.id,
            type: actualizada.type,
            // Se arregló o se pagó: mezclarlos hace imposible medir cuánto
            // cuestan las excepciones.
            status: actualizada.status,
          },
        });
      }

      return actualizada;
    });

    // Fuera de la transacción: el aviso es un efecto y no debe poder alargar
    // —ni tumbar— la escritura que de verdad importa.
    if (cambiaDeAsignado) {
      await this.avisarAlAsignado(tenantId, actualizada);
    }
    return actualizada;
  }
}
