import {
  EventVisibility,
  Prisma,
  ShipmentEventType,
  ShipmentStatus,
} from '@prisma/client';

/**
 * El registro de lo que le pasa a un envío.
 *
 * Vive aquí y no en un servicio de Nest a propósito: **un evento tiene que
 * escribirse en la misma transacción que el hecho que describe.** Un servicio
 * inyectado invita a llamarlo después, y entonces un fallo posterior deja el
 * cobro deshecho y el evento diciendo que se cobró. Recibiendo el `tx` de quien
 * llama eso no se puede hacer mal, y de paso no hay módulo que importar ni
 * ciclo de dependencias que evitar.
 */

/**
 * Quién ve cada tipo de evento cuando nadie dice lo contrario.
 *
 * **Es un defecto, no una ley**: `registrar` acepta una visibilidad explícita,
 * porque la misma clase de hecho puede querer publicarse o no según el caso —una
 * nota del operador es interna salvo cuando se escribe precisamente para que el
 * cliente la lea—.
 *
 * El criterio para elegir: es público lo que el cliente estaría preguntando por
 * teléfono («¿ya salió de aduana?», «¿cuánto pagué?»), e interno todo lo que
 * habla de cómo trabaja la empresa por dentro. Ante la duda, interno: publicar
 * de más no se puede deshacer, y el cliente ya lo vio.
 */
export const VISIBILIDAD_POR_DEFECTO: Record<
  ShipmentEventType,
  EventVisibility
> = {
  [ShipmentEventType.STATUS_CHANGED]: EventVisibility.PUBLIC,
  // Los impuestos los paga el cliente: saber cuánto y por qué es suyo.
  [ShipmentEventType.CUSTOMS_ASSESSED]: EventVisibility.PUBLIC,
  [ShipmentEventType.CUSTOMS_CLEARED]: EventVisibility.PUBLIC,
  // Que su pago quedó registrado es justo lo que un cliente quiere ver.
  [ShipmentEventType.CHARGE_COLLECTED]: EventVisibility.PUBLIC,
  // Los papeles del expediente y lo que se le va cargando son cocina interna.
  [ShipmentEventType.DOCUMENT_ADDED]: EventVisibility.INTERNAL,
  [ShipmentEventType.DOCUMENT_VERIFIED]: EventVisibility.INTERNAL,
  [ShipmentEventType.CHARGE_ADDED]: EventVisibility.INTERNAL,
  // Una excepción abierta es trabajo pendiente de la empresa. Al cliente se le
  // avisa cuando hay algo que decirle, no en cuanto alguien abre una incidencia.
  [ShipmentEventType.EXCEPTION_OPENED]: EventVisibility.INTERNAL,
  [ShipmentEventType.EXCEPTION_RESOLVED]: EventVisibility.INTERNAL,
  [ShipmentEventType.NOTE]: EventVisibility.INTERNAL,
  // Posventa. Aquí el criterio de arriba se aplica al revés que con las
  // excepciones, y no por inconsistencia: un reclamo lo abre el propio cliente,
  // así que ocultárselo sería esconderle lo que él mismo escribió. Es
  // exactamente lo que estaría preguntando por teléfono —«¿en qué va mi
  // reclamo?»— y la razón por la que llamaría si no lo ve.
  [ShipmentEventType.CLAIM_OPENED]: EventVisibility.PUBLIC,
  [ShipmentEventType.CLAIM_RESOLVED]: EventVisibility.PUBLIC,
  // La devolución cambia dónde está su paquete: si no la ve, lo sigue
  // esperando en casa.
  [ShipmentEventType.RETURN_STARTED]: EventVisibility.PUBLIC,
  [ShipmentEventType.RETURN_COMPLETED]: EventVisibility.PUBLIC,
  // Su dinero de vuelta. Igual que el cobro, que ya es público.
  [ShipmentEventType.REFUND_ISSUED]: EventVisibility.PUBLIC,
};

export interface EventoNuevo {
  tenantId: string;
  shipmentId: string;
  tipo: ShipmentEventType;
  /** Solo para `STATUS_CHANGED`. Ver `registrar`. */
  status?: ShipmentStatus | null;
  visibility?: EventVisibility;
  description?: string | null;
  metadata?: Prisma.InputJsonValue;
  locationLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
  legId?: string | null;
  actorUserId?: string | null;
  occurredAt?: Date;
}

/**
 * Escribe un evento dentro de la transacción de quien llama.
 *
 * El `status` solo se guarda en los `STATUS_CHANGED`. Si llegara en otro tipo se
 * descarta en vez de guardarse: un evento de «documento verificado» que además
 * llevara un estado haría que cualquier consulta que agrupe por estado lo
 * contara como si el envío hubiera avanzado, y el historial empezaría a mentir
 * poco a poco.
 */
export function registrar(
  tx: Prisma.TransactionClient,
  evento: EventoNuevo,
): Promise<{ id: string }> {
  const esCambioDeEstado = evento.tipo === ShipmentEventType.STATUS_CHANGED;
  return tx.shipmentEvent.create({
    data: {
      tenantId: evento.tenantId,
      shipmentId: evento.shipmentId,
      eventType: evento.tipo,
      status: esCambioDeEstado ? (evento.status ?? null) : null,
      visibility: evento.visibility ?? VISIBILIDAD_POR_DEFECTO[evento.tipo],
      description: evento.description,
      metadata: evento.metadata,
      locationLabel: evento.locationLabel,
      lat: evento.lat,
      lng: evento.lng,
      legId: evento.legId,
      createdByUserId: evento.actorUserId,
      occurredAt: evento.occurredAt,
    },
    select: { id: true },
  });
}

/**
 * Los eventos que puede ver el cliente.
 *
 * Se usa en el rastreo público, que no lleva sesión: aquí un olvido no es un
 * detalle de presentación, es enseñarle a cualquiera con un número de guía el
 * trabajo interno de la empresa.
 */
export const FILTRO_PUBLICO = { visibility: EventVisibility.PUBLIC } as const;
