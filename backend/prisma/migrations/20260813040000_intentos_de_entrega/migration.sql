-- Un intento de entrega por visita, en vez de un solo POD por parada.
--
-- `proof_of_deliveries.route_stop_id` es UNICO, asi que la parada solo podia
-- guardar un intento: el segundo hacia UPSERT y pisaba al primero. Se perdia lo
-- que hay que poder demostrar —que se fue tres veces y tres veces no habia
-- nadie— y el KPI de entregas al primer intento era incalculable, porque el
-- primer intento ya no estaba en ninguna parte.
--
-- Esta migracion NO toca `proof_of_deliveries`: ni le quita el unico ni le
-- borra filas. Esa tabla sigue siendo la proyeccion del ultimo intento y la
-- leen el detalle de ruta y el de envio. La tabla nueva manda; la vieja se
-- retira cuando no le quede ningun lector. Si el traspaso saliera mal, un
-- DELETE sobre `delivery_attempts` devuelve el sistema a donde estaba.

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryFailureReason" AS ENUM ('NO_RECIPIENT', 'WRONG_ADDRESS', 'PHONE_UNREACHABLE', 'CUSTOMER_REFUSED', 'BUSINESS_CLOSED', 'RESCHEDULED', 'OTHER');

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "route_stop_id" UUID,
    "attempt_number" INTEGER NOT NULL,
    "outcome" "DeliveryOutcome" NOT NULL,
    "failure_reason" "DeliveryFailureReason",
    "notes" TEXT,
    "received_by" TEXT,
    "signature_key" TEXT,
    "photo_key" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_by_user_id" UUID,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- El numero de intento es POR ENVIO, no por parada.
--
-- Por parada siempre valdria 1: una parada se cierra una sola vez, asi que el
-- reintento real no es volver a la misma parada, es una parada nueva en la ruta
-- del dia siguiente para el mismo envio. Numerar por parada habria dado un KPI
-- de «entregas al primer intento» del 100% sin que signifique nada.
--
-- No es adorno: es lo que hace segura la asignacion del numero. Sin el, dos
-- cierres simultaneos leen el mismo MAX() y crean dos «intento 2»; con el, el
-- segundo choca y el servicio reintenta.
CREATE UNIQUE INDEX "delivery_attempts_shipment_id_attempt_number_key" ON "delivery_attempts"("shipment_id", "attempt_number");

CREATE INDEX "delivery_attempts_tenant_id_idx" ON "delivery_attempts"("tenant_id");
CREATE INDEX "delivery_attempts_route_stop_id_idx" ON "delivery_attempts"("route_stop_id");
CREATE INDEX "delivery_attempts_shipment_id_attempted_at_idx" ON "delivery_attempts"("shipment_id", "attempted_at");
CREATE INDEX "delivery_attempts_tenant_id_outcome_idx" ON "delivery_attempts"("tenant_id", "outcome");

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL y no CASCADE: si se borra la parada, el intento ocurrio igual. Su
-- historia no se va con la planificacion, que es lo que pasaria con CASCADE:
-- replanificar una ruta borraria la prueba de los intentos ya hechos.
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_route_stop_id_fkey" FOREIGN KEY ("route_stop_id") REFERENCES "route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un intento con exito y motivo de fallo es una contradiccion, y un fallido sin
-- motivo es el texto libre de siempre disfrazado de enum. La base lo impide en
-- vez de confiar en que todos los que escriban se acuerden.
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_motivo_coherente"
  CHECK (
    (outcome = 'SUCCESS' AND failure_reason IS NULL)
    OR
    (outcome = 'FAILED' AND failure_reason IS NOT NULL)
  );

-- El numero de intento empieza en 1. Un 0 o un negativo solo puede venir de un
-- error de calculo, y se descubriria como un «intento 0» en la pantalla.
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_numero_positivo"
  CHECK (attempt_number >= 1);


-- ---------------------------------------------------------------------------
-- RLS. Prisma NO la genera: hay que escribirla a mano o la tabla queda legible
-- entre empresas. Aqui importa el doble, porque `signature_key` y `photo_key`
-- son claves del almacenamiento y con una clave se puede pedir una descarga
-- firmada; el bucket no tiene RLS que lo detenga.
ALTER TABLE "delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_attempts_tenant_isolation ON "delivery_attempts"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());


-- ---------------------------------------------------------------------------
-- Traspaso de los POD que ya existen.
--
-- Cada POD es un intento: el unico que la parada podia guardar. Se copia tal
-- cual, con su fecha de captura y su evidencia.
--
-- El numero sale de ordenar por fecha DENTRO de cada envio, no de poner 1 a
-- todos: un envio que se intento entregar tres veces tiene hoy tres POD en tres
-- paradas distintas, y aplanarlos a «intento 1» convertiria un historico real
-- en tres primeros intentos. `id` desempata para que dos POD con la misma marca
-- de tiempo —posible, porque `captured_at` se rellena por defecto— no dejen el
-- orden a merced del planificador.
--
-- **El motivo viejo entra como OTHER y el texto se guarda en `notes`.** Es
-- deliberado y es la parte incomoda de esta migracion. `failure_reason` era
-- texto libre: «no estaba», «ausente», «nadie en casa» y «Ausente!!» son la
-- misma causa escrita de cuatro formas, y adivinarla con un ILIKE clasificaria
-- mal una parte imposible de estimar. Un motivo inventado por la migracion no
-- se distingue despues de uno que eligio un repartidor, y contaminaria justo la
-- cifra que la fase 5 viene a hacer fiable. Queda el texto original intacto
-- para quien quiera reclasificar a mano; lo que no se hace es fingir que el
-- dato estaba clasificado.
INSERT INTO "delivery_attempts" (
  "id", "tenant_id", "shipment_id", "route_stop_id", "attempt_number",
  "outcome", "failure_reason", "notes", "received_by",
  "signature_key", "photo_key", "lat", "lng", "attempted_at", "created_at"
)
SELECT
  gen_random_uuid(),
  p."tenant_id",
  p."shipment_id",
  p."route_stop_id",
  ROW_NUMBER() OVER (PARTITION BY p."shipment_id" ORDER BY p."captured_at", p."id"),
  CASE WHEN p."failure_reason" IS NULL THEN 'SUCCESS'::"DeliveryOutcome"
       ELSE 'FAILED'::"DeliveryOutcome" END,
  CASE WHEN p."failure_reason" IS NULL THEN NULL
       ELSE 'OTHER'::"DeliveryFailureReason" END,
  p."failure_reason",
  p."received_by",
  p."signature_key",
  p."photo_key",
  p."lat",
  p."lng",
  p."captured_at",
  p."created_at"
FROM "proof_of_deliveries" p;

-- La migracion se comprueba a si misma en vez de confiar en que salio bien.
--
-- Un POD sin su intento significa que el traspaso perdio evidencia, y eso no se
-- puede descubrir semanas despues: para entonces ya hay intentos nuevos
-- mezclados y no se sabe cual falta. Se comprueba sobre las filas que habia de
-- verdad, no sobre una tabla vacia —con cero POD la cuenta da 0 = 0 y pasa,
-- que es lo correcto: no habia nada que traspasar—.
DO $$
DECLARE
  pods INTEGER;
  intentos INTEGER;
  incoherentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO pods FROM "proof_of_deliveries";
  SELECT COUNT(*) INTO intentos FROM "delivery_attempts";
  IF pods <> intentos THEN
    RAISE EXCEPTION 'Traspaso incompleto: % pruebas de entrega y % intentos', pods, intentos;
  END IF;

  -- Que ninguna fila haya entrado violando la coherencia que el CHECK exige.
  -- El CHECK ya lo impediria, pero un mensaje claro aqui explica QUE fila y no
  -- solo que una restriccion fallo.
  SELECT COUNT(*) INTO incoherentes FROM "delivery_attempts"
   WHERE (outcome = 'FAILED' AND failure_reason IS NULL)
      OR (outcome = 'SUCCESS' AND failure_reason IS NOT NULL);
  IF incoherentes > 0 THEN
    RAISE EXCEPTION 'Traspaso incoherente: % intentos con desenlace y motivo que no casan', incoherentes;
  END IF;
END $$;
