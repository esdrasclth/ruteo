-- Direcciones reutilizables (5.2) y modo de entrega (5.3).
--
-- Van juntas porque se tocan en la misma tabla —`shipments` gana una columna
-- por cada una— y separarlas obligaria a reescribir el envio dos veces.

-- ---------------------------------------------------------------------------
-- 5.2 Direcciones del cliente.
--
-- Hasta ahora cada envio repetia la direccion como texto plano en
-- `destination_label`: una colonia mal escrita habia que corregirla envio por
-- envio, y no habia forma de saber que dos envios iban al mismo sitio.
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "department" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "neighborhood" TEXT,
    "street" TEXT,
    "reference" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_addresses_tenant_id_idx" ON "customer_addresses"("tenant_id");
CREATE INDEX "customer_addresses_customer_id_active_idx" ON "customer_addresses"("customer_id", "active");

ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE y no SET NULL: una direccion sin cliente no le sirve a nadie, no se
-- puede volver a ofrecer y solo estorba en los recuentos. El historial de los
-- envios no depende de esto —guardan su copia congelada— asi que no se pierde
-- nada que haga falta despues.
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sola direccion por defecto por cliente, y solo entre las activas.
--
-- Prisma NO sabe expresar un unico parcial, asi que va a mano. Sin el, marcar
-- otra por defecto sin desmarcar la anterior deja dos, y el alta de envios
-- propondria una u otra segun el orden que devuelva Postgres ese dia: un fallo
-- que se manifiesta como «a veces sale la direccion vieja» y que nadie
-- consigue reproducir.
CREATE UNIQUE INDEX "customer_addresses_una_por_defecto"
  ON "customer_addresses"("customer_id")
  WHERE "is_default" AND "active";

-- RLS. Prisma no la genera: sin esto, las direcciones de los clientes de una
-- empresa —con nombre, telefono y referencia de como llegar a su casa— quedan
-- legibles por cualquier otra.
ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_addresses" FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_addresses_tenant_isolation ON "customer_addresses"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());


-- ---------------------------------------------------------------------------
-- 5.3 Modo de entrega.
CREATE TYPE "DeliveryMode" AS ENUM ('HOME', 'BRANCH', 'PICKUP_POINT');

-- HOME por defecto porque es lo que hacen hoy TODOS los envios que ya existen.
-- Un enum nuevo sin defecto obligaria a rellenar la columna a mano en la
-- migracion, y elegir por el usuario un modo que nunca declaro seria inventar
-- datos; aqui el defecto no inventa nada: describe lo que venia pasando.
ALTER TABLE "shipments" ADD COLUMN "delivery_mode" "DeliveryMode" NOT NULL DEFAULT 'HOME';
ALTER TABLE "shipments" ADD COLUMN "delivery_warehouse_id" UUID;
ALTER TABLE "shipments" ADD COLUMN "destination_address_id" UUID;

CREATE INDEX "shipments_destination_address_id_idx" ON "shipments"("destination_address_id");
-- La pregunta de la clasificacion: que hay pendiente de retirar en esta
-- sucursal. Sin el indice es un recorrido completo de `shipments` cada vez que
-- alguien abre la pantalla de la bodega.
CREATE INDEX "shipments_tenant_id_delivery_mode_idx" ON "shipments"("tenant_id", "delivery_mode");
CREATE INDEX "shipments_delivery_warehouse_id_idx" ON "shipments"("delivery_warehouse_id");

-- SET NULL en las dos: ni archivar una direccion ni cerrar una sucursal deben
-- borrar el envio. Lo que se pierde es el enlace, no el envio, y los campos
-- planos del destino siguen diciendo a donde iba.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_destination_address_id_fkey" FOREIGN KEY ("destination_address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_delivery_warehouse_id_fkey" FOREIGN KEY ("delivery_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un envio a domicilio con sucursal de retiro asignada es una contradiccion que
-- despues nadie sabe leer: no se sabe si se clasifica al monton de rutas o al
-- de mostrador. El servicio lo valida al escribir; esto lo sostiene aunque
-- alguien escriba por otro camino.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sucursal_coherente"
  CHECK (
    ("delivery_mode" = 'BRANCH' AND "delivery_warehouse_id" IS NOT NULL)
    OR
    ("delivery_mode" <> 'BRANCH' AND "delivery_warehouse_id" IS NULL)
  );
