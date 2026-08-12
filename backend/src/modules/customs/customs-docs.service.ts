import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  AddDocumentDto,
  CerrarReglaDto,
  CreateCustomsRuleDto,
} from './dto/customs-rule.dto';

/**
 * Reglas aduaneras y expediente documental.
 *
 * Va aparte de `CustomsService` porque responde otra pregunta: aquel liquida un
 * envío concreto, este administra la normativa y los papeles. Meterlos juntos
 * habría dejado un servicio que hace de calculadora y de archivador a la vez.
 */
@Injectable()
export class CustomsDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --- Reglas ---------------------------------------------------------------

  listRules(tenantId: string, soloVigentes = false) {
    const ahora = new Date();
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customsRule.findMany({
        where: soloVigentes
          ? {
              effectiveFrom: { lte: ahora },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: ahora } }],
            }
          : {},
        orderBy: [
          { country: 'asc' },
          { effectiveFrom: 'desc' },
          { maxValue: 'asc' },
        ],
      }),
    );
  }

  createRule(tenantId: string, dto: CreateCustomsRuleDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customsRule.create({
        data: {
          tenantId,
          country: dto.country.toUpperCase(),
          category: dto.category,
          maxValue: dto.maxValue,
          currency: dto.currency ?? 'USD',
          requiresInvoice: dto.requiresInvoice ?? false,
          requiresPermit: dto.requiresPermit ?? false,
          requiresBroker: dto.requiresBroker ?? false,
          dutyRate: dto.dutyRate,
          taxRate: dto.taxRate,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : new Date(),
        },
      }),
    );
  }

  /**
   * Cierra una regla. **No hay borrar, y es deliberado.**
   *
   * Una regla borrada se lleva por delante la explicación de todas las
   * liquidaciones que se hicieron con ella: `CustomsRecord.ruleId` quedaría
   * apuntando a nada y la respuesta a «por qué se cobró esto» se perdería. Se
   * cierra con fecha y deja de elegirse a partir de ahí.
   */
  async cerrarRule(tenantId: string, id: string, dto: CerrarReglaDto) {
    const regla = await this.prisma.withTenant(tenantId, (tx) =>
      tx.customsRule.findUnique({ where: { id } }),
    );
    if (!regla) throw new NotFoundException('La regla no existe');

    const hasta = new Date(dto.effectiveTo);
    if (hasta <= regla.effectiveFrom) {
      throw new BadRequestException(
        'La fecha de cierre tiene que ser posterior a la de inicio.',
      );
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customsRule.update({ where: { id }, data: { effectiveTo: hasta } }),
    );
  }

  // --- Documentos -----------------------------------------------------------

  /** Adjunta un documento ya subido al expediente de un envío. */
  async addDocument(
    tenantId: string,
    shipmentId: string,
    dto: AddDocumentDto,
    userId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const envio = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: { id: true },
      });
      if (!envio) throw new NotFoundException('El envío no existe');

      // El RLS ya impide ver el archivo de otra empresa, así que si no aparece
      // desde aquí es que no es suyo.
      const archivo = await tx.fileObject.findUnique({
        where: { id: dto.fileId },
        select: { id: true },
      });
      if (!archivo) throw new NotFoundException('El archivo no existe');

      return tx.document.create({
        data: {
          tenantId,
          shipmentId,
          fileId: dto.fileId,
          type: dto.type,
          notes: dto.notes,
          uploadedByUserId: userId,
        },
      });
    });
  }

  /** El expediente, con URL firmada para poder abrir cada documento. */
  async listDocuments(tenantId: string, shipmentId: string) {
    const docs = await this.prisma.withTenant(tenantId, (tx) =>
      tx.document.findMany({
        where: { shipmentId },
        orderBy: { createdAt: 'asc' },
        include: {
          file: {
            select: { key: true, originalName: true, contentType: true },
          },
        },
      }),
    );

    return Promise.all(
      docs.map(async (doc) => ({
        id: doc.id,
        type: doc.type,
        notes: doc.notes,
        verifiedAt: doc.verifiedAt,
        createdAt: doc.createdAt,
        originalName: doc.file.originalName,
        contentType: doc.file.contentType,
        // Se firma al leer y dura minutos. Guardar la URL sería dejar escrito un
        // pase que funciona sin sesión.
        url: await this.storage
          .firmarDescarga(doc.file.key, tenantId)
          // Que un documento no se pueda firmar no debe tumbar el expediente
          // entero: se pierde ese enlace, no la pantalla.
          .catch(() => null),
      })),
    );
  }

  /**
   * Marca un documento como verificado.
   *
   * Separa «alguien subió un PDF» de «alguien lo miró y dice que sirve», que es
   * la diferencia entre tener un documento y tener el trámite cubierto.
   */
  async verifyDocument(tenantId: string, id: string, userId?: string) {
    const doc = await this.prisma.withTenant(tenantId, (tx) =>
      tx.document.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!doc) throw new NotFoundException('El documento no existe');

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.document.update({
        where: { id },
        data: { verifiedByUserId: userId, verifiedAt: new Date() },
      }),
    );
  }
}
