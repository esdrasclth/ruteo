-- CreateEnum
CREATE TYPE "CustomsCategory" AS ENUM ('A', 'B', 'C', 'ENVIO_FAMILIAR');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMMERCIAL_INVOICE', 'AIR_WAYBILL', 'CUSTOMS_DECLARATION', 'PERMIT', 'IDENTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ValueSource" AS ENUM ('CUSTOMER', 'INVOICE', 'ESTIMATED', 'CUSTOMS');

-- AlterTable
ALTER TABLE "customs_records" ADD COLUMN     "category" "CustomsCategory",
ADD COLUMN     "customs_value" DECIMAL(12,2),
ADD COLUMN     "declared_by_user_id" UUID,
ADD COLUMN     "freight_amount" DECIMAL(12,2),
ADD COLUMN     "insurance_amount" DECIMAL(12,2),
ADD COLUMN     "other_charges" DECIMAL(12,2),
ADD COLUMN     "product_value" DECIMAL(12,2),
ADD COLUMN     "rule_id" UUID,
ADD COLUMN     "value_source" "ValueSource",
ADD COLUMN     "verified_by_user_id" UUID;

-- CreateTable
CREATE TABLE "customs_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "category" "CustomsCategory" NOT NULL,
    "max_value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "requires_invoice" BOOLEAN NOT NULL DEFAULT false,
    "requires_permit" BOOLEAN NOT NULL DEFAULT false,
    "requires_broker" BOOLEAN NOT NULL DEFAULT false,
    "duty_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "notes" TEXT,
    "uploaded_by_user_id" UUID,
    "verified_by_user_id" UUID,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customs_rules_tenant_id_idx" ON "customs_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "customs_rules_tenant_id_country_category_effective_from_idx" ON "customs_rules"("tenant_id", "country", "category", "effective_from");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_shipment_id_idx" ON "documents"("shipment_id");

-- AddForeignKey
ALTER TABLE "customs_records" ADD CONSTRAINT "customs_records_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "customs_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_rules" ADD CONSTRAINT "customs_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas. Prisma no la genera y olvidarla no rompe nada
-- visiblemente: la tabla funciona y deja los datos de todas las empresas al
-- alcance de cualquiera con sesion.
--
-- En `documents` importa el doble: la fila apunta a la clave de un archivo del
-- almacenamiento, y con ella se puede pedir una descarga firmada. El
-- almacenamiento no tiene RLS que lo detenga.
ALTER TABLE "customs_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customs_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY customs_rules_tenant_isolation ON "customs_rules"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_isolation ON "documents"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
