-- Eventos tipados: el estado dice DONDE esta el envio, el evento dice COMO
-- llego ahi.
--
-- Hasta ahora `status` era obligatorio en `shipment_events`, asi que lo unico
-- que se podia registrar era un cambio de estado. Un hecho como «se verifico la
-- factura» o «se cobraron 135.63» no tenia donde caer, y de ahi cuelgan el
-- tablero de operacion, la vista de cliente separada de la de operador y casi
-- toda la trazabilidad de las fases 2 y 3.

CREATE TYPE "ShipmentEventType" AS ENUM (
  'STATUS_CHANGED', 'CUSTOMS_ASSESSED', 'CUSTOMS_CLEARED',
  'DOCUMENT_ADDED', 'DOCUMENT_VERIFIED',
  'CHARGE_ADDED', 'CHARGE_COLLECTED',
  'EXCEPTION_OPENED', 'EXCEPTION_RESOLVED',
  'NOTE'
);

CREATE TYPE "EventVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

-- --------------------------------------------------------------------------
-- Lo que ya hay: todo evento existente ES un cambio de estado, porque era lo
-- unico que se podia guardar. El DEFAULT hace el relleno de las filas viejas en
-- el mismo ALTER y despues se quita: a partir de aqui el tipo se dice siempre,
-- para que nadie herede un `STATUS_CHANGED` por descuido.
ALTER TABLE "shipment_events"
  ADD COLUMN "event_type" "ShipmentEventType" NOT NULL DEFAULT 'STATUS_CHANGED';
ALTER TABLE "shipment_events" ALTER COLUMN "event_type" DROP DEFAULT;

-- Mismo truco al reves. Las filas que ya existen son PUBLICAS —son los hitos
-- que el cliente lleva viendo desde siempre en el rastreo, y volverlas internas
-- vaciaria de golpe la pantalla publica de todos los envios en curso—, pero de
-- aqui en adelante lo nuevo nace INTERNAL, que es el lado barato de
-- equivocarse.
ALTER TABLE "shipment_events"
  ADD COLUMN "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "shipment_events" ALTER COLUMN "visibility" SET DEFAULT 'INTERNAL';

-- El cambio de raiz: `status` deja de ser obligatorio. Los eventos que si
-- cambian el estado lo siguen llevando y nada de lo guardado se toca.
ALTER TABLE "shipment_events" ALTER COLUMN "status" DROP NOT NULL;

ALTER TABLE "shipment_events" ADD COLUMN "metadata" JSONB;

-- El rastreo publico pide los eventos de un envio filtrando por visibilidad, y
-- es la consulta con mas trafico del sistema: no necesita sesion.
CREATE INDEX "shipment_events_shipment_id_visibility_occurred_at_idx"
  ON "shipment_events"("shipment_id", "visibility", "occurred_at");

-- Sin politica RLS nueva: la tabla ya la tiene y aqui solo se le agregan
-- columnas.

-- --------------------------------------------------------------------------
-- Comprobacion del traspaso. Si algun evento se hubiera quedado sin tipo o
-- hubiera perdido su estado, la migracion revienta aqui en vez de dejar el
-- historial roto en silencio y que se descubra semanas despues.
DO $$
DECLARE
  sin_tipo bigint;
  sin_estado bigint;
BEGIN
  SELECT count(*) INTO sin_tipo FROM shipment_events WHERE event_type IS NULL;
  SELECT count(*) INTO sin_estado
    FROM shipment_events WHERE event_type = 'STATUS_CHANGED' AND status IS NULL;

  IF sin_tipo > 0 OR sin_estado > 0 THEN
    RAISE EXCEPTION
      'Traspaso de eventos incompleto: % sin tipo, % cambios de estado sin estado',
      sin_tipo, sin_estado;
  END IF;
END $$;
