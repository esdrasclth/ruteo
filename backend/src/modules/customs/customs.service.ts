import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomsStatus,
  DocumentType,
  Prisma,
  ShipmentEventType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { motivosParaNoLiberar, saldoPendiente } from '../charges/saldo';
import { registrar } from '../shipments/eventos';
import { cargosDeLiquidacion } from './cargos';
import { computeCharges } from './customs-calc';
import {
  documentosQueFaltan,
  elegirRegla,
  liquidar,
  ReglaAplicable,
  valorAduanero,
} from './reglas';
import { UpsertCustomsDto } from './dto/upsert-customs.dto';

@Injectable()
export class CustomsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea o actualiza el expediente aduanero de un envío.
   *
   * **La liquidación sale de la regla vigente**, no de constantes. Se guarda
   * además QUÉ regla se aplicó (`ruleId`): la regla puede cambiar después, y sin
   * ese puntero la respuesta a «por qué se cobró esto» sería la tarifa de hoy en
   * vez de la que estaba vigente ese día.
   *
   * Si el tenant no tiene reglas configuradas se sigue usando el cálculo
   * anterior, para no romper a quien ya lo estaba usando. Pero la respuesta dice
   * de dónde salieron las cifras: un cobro calculado con valores por defecto que
   * nadie configuró tiene que ser visible, no silencioso.
   */
  async upsert(tenantId: string, dto: UpsertCustomsDto, userId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: {
          id: true,
          declaredValue: true,
          currency: true,
          destinationCountry: true,
        },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }

      // El desglose manda; si no viene, se cae al valor declarado del envío para
      // no perder lo que ya había.
      const desglose = {
        productValue:
          dto.productValue ?? dto.declaredValue ?? shipment.declaredValue,
        freightAmount: dto.freightAmount,
        insuranceAmount: dto.insuranceAmount,
        otherCharges: dto.otherCharges,
      };
      const customsValue = valorAduanero(desglose);
      const country = dto.country ?? shipment.destinationCountry ?? 'HN';

      const reglas = (await tx.customsRule.findMany({
        where: { country },
      })) as unknown as ReglaAplicable[];
      const regla = elegirRegla(reglas, country, customsValue);

      let calculo;
      let fuente: 'regla' | 'manual' | 'defecto';
      if (regla) {
        calculo = liquidar(regla, desglose, dto.handlingFee);
        fuente = 'regla';
      } else {
        // Sin regla: se respetan las tasas que venga a mano quien llama, y si
        // tampoco vienen se usan las de `customs-calc`. Marcado como `defecto`
        // para que se vea que nadie configuró esto.
        const charges = computeCharges({
          declaredValue: customsValue,
          dutyRate: dto.dutyRate,
          taxRate: dto.taxRate,
          handlingFee: dto.handlingFee,
        });
        calculo = {
          customsValue,
          dutyAmount: charges.dutyAmount,
          taxAmount: charges.taxAmount,
          totalCharges: charges.totalCharges,
        };
        fuente =
          dto.dutyRate !== undefined || dto.taxRate !== undefined
            ? 'manual'
            : 'defecto';
      }

      const data = {
        status: dto.status,
        category: regla?.category ?? dto.category,
        ruleId: regla?.id ?? null,
        productValue: desglose.productValue,
        freightAmount: dto.freightAmount,
        insuranceAmount: dto.insuranceAmount,
        otherCharges: dto.otherCharges,
        customsValue: calculo.customsValue,
        valueSource: dto.valueSource,
        declaredByUserId: userId,
        // `declaredValue` se conserva por compatibilidad: es lo que leen las
        // pantallas y la API pública de hoy. Ahora es el valor ADUANERO, que es
        // sobre el que se liquida.
        declaredValue: calculo.customsValue,
        dutyAmount: calculo.dutyAmount,
        taxAmount: calculo.taxAmount,
        handlingFee: new Prisma.Decimal(dto.handlingFee ?? 0),
        totalCharges: calculo.totalCharges,
        currency: dto.currency ?? shipment.currency,
        notes: dto.notes,
      };

      const record = await tx.customsRecord.upsert({
        where: { shipmentId: dto.shipmentId },
        create: {
          tenantId,
          shipmentId: dto.shipmentId,
          ...data,
          status: dto.status ?? CustomsStatus.PENDING,
        },
        update: data,
        include: { rule: true },
      });

      // Los cargos con naturaleza declarada, que es donde vive la verdad
      // contable desde la fase 4. Se reemplazan los que genero una liquidacion
      // anterior (`source: 'customs'`) en vez de acumularlos: recalcular no debe
      // duplicar el cobro.
      //
      // Los de `source: 'manual'` y los de `'migracion'` NO se tocan: los puso
      // alguien a mano o vienen de datos que ya existian, y borrarlos al
      // recalcular seria perder dinero registrado.
      await tx.charge.deleteMany({
        where: { shipmentId: dto.shipmentId, source: 'customs' },
      });
      const cargos = cargosDeLiquidacion({
        dutyAmount: calculo.dutyAmount,
        taxAmount: calculo.taxAmount,
        handlingFee: new Prisma.Decimal(dto.handlingFee ?? 0),
      });
      if (cargos.length > 0) {
        await tx.charge.createMany({
          data: cargos.map((c) => ({
            tenantId,
            shipmentId: dto.shipmentId,
            concept: c.concept,
            kind: c.kind,
            amount: c.amount,
            currency: data.currency,
            source: 'customs',
          })),
        });
      }

      // Lo que se le cobra al cliente y de dónde salió la cifra. Es público: el
      // impuesto lo paga él, y «¿por qué me cobraron esto?» es la pregunta que
      // más veces se contesta por teléfono.
      //
      // **Las cifras salen de `record`, no del cálculo en memoria.** La columna
      // es `Decimal(12,2)` y redondea al guardar: escribir aquí el valor sin
      // redondear deja el historial diciendo 90.625 donde la liquidación cobra
      // 90.63, y ese medio centavo es justo el que hace que un cliente que
      // compara las dos pantallas deje de fiarse de las dos.
      await registrar(tx, {
        tenantId,
        shipmentId: dto.shipmentId,
        tipo: ShipmentEventType.CUSTOMS_ASSESSED,
        description: `Liquidación de aduana: ${record.totalCharges?.toFixed(2) ?? '0.00'} ${record.currency}`,
        actorUserId: userId,
        metadata: {
          customsValue: record.customsValue?.toString() ?? null,
          dutyAmount: record.dutyAmount?.toString() ?? null,
          taxAmount: record.taxAmount?.toString() ?? null,
          handlingFee: record.handlingFee?.toString() ?? null,
          total: record.totalCharges?.toString() ?? null,
          currency: record.currency,
          // De dónde salieron las cifras. Un cobro calculado con valores por
          // defecto que nadie configuró tiene que quedar por escrito.
          fuente,
          ruleId: regla?.id ?? null,
        },
      });

      return { ...record, fuente, faltan: await this.faltantes(tx, record) };
    });
  }

  /**
   * Qué documentos exige la regla aplicada y todavía no están.
   *
   * Se calcula al leer y no se guarda: un documento subido después tiene que
   * cambiar la respuesta sin que nadie recalcule nada a mano.
   */
  private async faltantes(
    tx: Prisma.TransactionClient,
    record: { shipmentId: string; ruleId: string | null },
  ): Promise<string[]> {
    if (!record.ruleId) return [];
    const regla = (await tx.customsRule.findUnique({
      where: { id: record.ruleId },
    })) as unknown as ReglaAplicable | null;
    if (!regla) return [];

    const docs = await tx.document.findMany({
      where: { shipmentId: record.shipmentId },
      select: { type: true },
    });
    const tipos = new Set(docs.map((d) => d.type));
    return documentosQueFaltan(regla, {
      requiereFactura: tipos.has(DocumentType.COMMERCIAL_INVOICE),
      requierePermiso: tipos.has(DocumentType.PERMIT),
    });
  }

  async findByShipment(tenantId: string, shipmentId: string) {
    const record = await this.prisma.withTenant(tenantId, async (tx) => {
      const r = await tx.customsRecord.findUnique({
        where: { shipmentId },
        include: { rule: true },
      });
      if (!r) return null;
      return { ...r, faltan: await this.faltantes(tx, r) };
    });
    if (!record) {
      throw new NotFoundException('Customs record not found');
    }
    return record;
  }

  /**
   * Libera el envío de aduana.
   *
   * **No libera si faltan documentos que la regla exige ni si queda saldo por
   * cobrar.** Los dos son el mismo criterio: soltar la mercancía es quedarse sin
   * la palanca. Con la factura sin subir, el expediente queda incompleto justo
   * en el trámite donde el courier responde por lo declarado; con el cobro
   * pendiente, la deuda pasa a perseguirse por teléfono.
   *
   * La regla del saldo consulta `Charge` —que desde la fase 4 es donde vive el
   * dinero— y no un estado que alguien tenga que acordarse de poner.
   */
  async clear(tenantId: string, shipmentId: string, userId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const record = await tx.customsRecord.findUnique({
        where: { shipmentId },
      });
      if (!record) {
        throw new NotFoundException('Customs record not found');
      }

      const [faltan, cargos] = await Promise.all([
        this.faltantes(tx, record),
        tx.charge.findMany({
          where: { shipmentId },
          select: { status: true, kind: true, amount: true, currency: true },
        }),
      ]);
      const bloqueo = motivosParaNoLiberar({
        faltanDocumentos: faltan,
        saldo: saldoPendiente(cargos),
        moneda: cargos[0]?.currency ?? record.currency,
      });
      if (bloqueo) {
        throw new BadRequestException(bloqueo);
      }

      const liberado = await tx.customsRecord.update({
        where: { shipmentId },
        data: {
          status: CustomsStatus.CLEARED,
          clearedAt: new Date(),
          verifiedByUserId: userId,
        },
        include: { rule: true },
      });

      // Liberar de aduana NO cambia el estado del envío —esa transición es
      // manual y aparte—, así que hasta ahora el trámite más esperado de todo
      // el trayecto no dejaba ni una línea en el historial.
      await registrar(tx, {
        tenantId,
        shipmentId,
        tipo: ShipmentEventType.CUSTOMS_CLEARED,
        description: 'Liberado de aduana',
        actorUserId: userId,
        metadata: {
          total: liberado.totalCharges?.toString() ?? null,
          currency: liberado.currency,
        },
      });

      return liberado;
    });
  }
}
