-- Fase 6 - Posventa: reclamos, devoluciones y reembolsos.
--
-- Cuatro tablas nuevas y ningun cambio destructivo: nada de lo que ya existia
-- cambia de forma, asi que esta migracion se deshace borrando las tablas.
--
-- Los tipos de evento nuevos se anaden al enum aqui mismo. Postgres 12+ lo
-- permite dentro de una transaccion siempre que no se USEN en ella, y no se
-- usan: los escribe el codigo de la aplicacion despues.

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('DAMAGED', 'LOST', 'MISSING_ITEM', 'WRONG_CHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'APPROVED', 'REJECTED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ReturnDestination" AS ENUM ('BRANCH', 'SENDER', 'VENDOR', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('UNDELIVERABLE', 'REFUSED', 'UNCLAIMED', 'UNPAID', 'CUSTOMS_REJECTED', 'DAMAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShipmentEventType" ADD VALUE 'CLAIM_OPENED';
ALTER TYPE "ShipmentEventType" ADD VALUE 'CLAIM_RESOLVED';
ALTER TYPE "ShipmentEventType" ADD VALUE 'RETURN_STARTED';
ALTER TYPE "ShipmentEventType" ADD VALUE 'RETURN_COMPLETED';
ALTER TYPE "ShipmentEventType" ADD VALUE 'REFUND_ISSUED';

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "shipment_id" UUID NOT NULL,
    "package_id" UUID,
    "customer_id" UUID,
    "exception_id" UUID,
    "charge_id" UUID,
    "description" TEXT NOT NULL,
    "claimed_amount" DECIMAL(12,2),
    "approved_amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "opened_by_user_id" UUID,
    "assigned_to_user_id" UUID,
    "resolved_by_user_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "from_customer" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "exception_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "destination" "ReturnDestination" NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "warehouse_id" UUID,
    "notes" TEXT,
    "attempts_before" INTEGER,
    "decided_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "claim_id" UUID,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'HNL',
    "method" "PaymentMethod",
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "issued_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_tenant_id_idx" ON "claims"("tenant_id");

-- CreateIndex
CREATE INDEX "claims_tenant_id_status_idx" ON "claims"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "claims_shipment_id_idx" ON "claims"("shipment_id");

-- CreateIndex
CREATE INDEX "claims_customer_id_idx" ON "claims"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "claims_tenant_id_number_key" ON "claims"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "claim_files_tenant_id_idx" ON "claim_files"("tenant_id");

-- CreateIndex
CREATE INDEX "claim_files_claim_id_idx" ON "claim_files"("claim_id");

-- CreateIndex
CREATE INDEX "exception_files_tenant_id_idx" ON "exception_files"("tenant_id");

-- CreateIndex
CREATE INDEX "exception_files_exception_id_idx" ON "exception_files"("exception_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_shipment_id_key" ON "returns"("shipment_id");

-- CreateIndex
CREATE INDEX "returns_tenant_id_idx" ON "returns"("tenant_id");

-- CreateIndex
CREATE INDEX "returns_tenant_id_status_idx" ON "returns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_idx" ON "refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_status_idx" ON "refunds"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "locker_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "exceptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_files" ADD CONSTRAINT "claim_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_files" ADD CONSTRAINT "claim_files_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_files" ADD CONSTRAINT "claim_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_files" ADD CONSTRAINT "exception_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_files" ADD CONSTRAINT "exception_files_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_files" ADD CONSTRAINT "exception_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS de las cuatro tablas nuevas. Prisma NO lo genera y olvidarlo no rompe
-- nada visiblemente: la tabla funciona, y deja los datos de todas las empresas
-- al alcance de cualquiera con sesión. El rol de la aplicación es NOBYPASSRLS,
-- así que estas políticas se aplican de verdad.
--
-- Aquí pesa más que en otras tablas. `claims` guarda la disputa de un cliente
-- con su courier —lo que reclamó, lo que le concedieron y por qué se le negó—,
-- y `refunds` guarda a quién se le devolvió dinero y por cuánto. Es
-- exactamente lo que un competidor querría leer.
--
-- La prueba estructural de `test/rls-isolation.e2e-spec.ts` falla sola si
-- alguna de estas cuatro se queda sin política, así que este bloque no depende
-- de que alguien se acuerde.
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY claims_tenant_isolation ON "claims"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "claim_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_files" FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_files_tenant_isolation ON "claim_files"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "exception_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exception_files" FORCE ROW LEVEL SECURITY;
CREATE POLICY exception_files_tenant_isolation ON "exception_files"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY returns_tenant_isolation ON "returns"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY refunds_tenant_isolation ON "refunds"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Un reembolso no puede superar lo que se cobró, y esto lo sostiene la base y
-- no sólo el servicio: la comprobación de importe vive en `RefundsService`,
-- pero un `UPDATE` por consola o un endpoint futuro que no pase por ahí la
-- saltarían. Lo que no se puede expresar aquí —la suma de reembolsos de un
-- pago— se queda en el servicio; esto ataja al menos el importe absurdo.
ALTER TABLE "refunds"
  ADD CONSTRAINT refunds_amount_positivo CHECK ("amount" > 0);

-- Sólo BRANCH tiene sucursal, y sólo BRANCH la exige. Mismo criterio que el
-- CHECK de `delivery_mode` de la fase 5: el servicio ya lo valida, pero una
-- devolución escrita por otro camino con destino SENDER y una sucursal puesta
-- deja un dato que después nadie sabe interpretar.
ALTER TABLE "returns"
  ADD CONSTRAINT returns_sucursal_solo_en_branch CHECK (
    ("destination" = 'BRANCH' AND "warehouse_id" IS NOT NULL)
    OR ("destination" <> 'BRANCH' AND "warehouse_id" IS NULL)
  );
