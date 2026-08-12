-- CreateEnum
CREATE TYPE "ChargeConcept" AS ENUM ('FREIGHT', 'HANDLING', 'FUEL', 'INSURANCE', 'STORAGE', 'DELIVERY', 'REPACK', 'DUTY', 'TAX', 'PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('REVENUE', 'PASS_THROUGH');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "concept" "ChargeConcept" NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charges_tenant_id_idx" ON "charges"("tenant_id");

-- CreateIndex
CREATE INDEX "charges_shipment_id_idx" ON "charges"("shipment_id");

-- CreateIndex
CREATE INDEX "charges_tenant_id_status_idx" ON "charges"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS. `charges` es la tabla de dinero: sin politica, un tenant veria lo que
-- factura otro.
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "charges" FORCE ROW LEVEL SECURITY;
CREATE POLICY charges_tenant_isolation ON "charges"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());


-- ---------------------------------------------------------------------------
-- Traspaso de lo que ya estaba cobrado.
--
-- `customs_records` mezclaba en una fila el arancel y el impuesto —que son del
-- Estado— con el cargo por manejo, que es de la empresa. Aqui cada uno pasa a
-- ser una fila con su naturaleza declarada.
--
-- **No se inventa nada y no se borra nada.** Solo se copian los importes que ya
-- existian, y las columnas de `customs_records` se quedan donde estan: las leen
-- las pantallas y la API de hoy. Si este traspaso saliera mal, borrar las filas
-- de `charges` devuelve el sistema exactamente a donde estaba.
--
-- Solo se copia lo que es mayor que cero: un arancel de 0 no es un cargo, es la
-- ausencia de uno, y crearlo llenaria la tabla de ceros que nadie va a cobrar.
--
-- `source = 'migracion'` los distingue de los que genere la liquidacion a
-- partir de ahora, para que un recalculo no los duplique.
INSERT INTO "charges" (id, tenant_id, shipment_id, concept, kind, status, amount, currency, source, created_at, updated_at)
SELECT gen_random_uuid(), cr.tenant_id, cr.shipment_id, 'DUTY', 'PASS_THROUGH',
       (CASE WHEN cr.status = 'CLEARED' THEN 'PAID' ELSE 'PENDING' END)::"ChargeStatus",
       cr.duty_amount, cr.currency, 'migracion', now(), now()
  FROM customs_records cr
 WHERE cr.duty_amount IS NOT NULL AND cr.duty_amount > 0;

INSERT INTO "charges" (id, tenant_id, shipment_id, concept, kind, status, amount, currency, source, created_at, updated_at)
SELECT gen_random_uuid(), cr.tenant_id, cr.shipment_id, 'TAX', 'PASS_THROUGH',
       (CASE WHEN cr.status = 'CLEARED' THEN 'PAID' ELSE 'PENDING' END)::"ChargeStatus",
       cr.tax_amount, cr.currency, 'migracion', now(), now()
  FROM customs_records cr
 WHERE cr.tax_amount IS NOT NULL AND cr.tax_amount > 0;

-- El manejo es lo unico de los tres que es INGRESO de la empresa. Que hasta hoy
-- estuviera sumado en la misma fila que los tributos es exactamente el problema
-- que esta fase arregla.
INSERT INTO "charges" (id, tenant_id, shipment_id, concept, kind, status, amount, currency, source, created_at, updated_at)
SELECT gen_random_uuid(), cr.tenant_id, cr.shipment_id, 'HANDLING', 'REVENUE',
       (CASE WHEN cr.status = 'CLEARED' THEN 'PAID' ELSE 'PENDING' END)::"ChargeStatus",
       cr.handling_fee, cr.currency, 'migracion', now(), now()
  FROM customs_records cr
 WHERE cr.handling_fee IS NOT NULL AND cr.handling_fee > 0;
