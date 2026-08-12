-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('ORIGIN', 'DESTINATION', 'BRANCH');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('DRAFT', 'TRANSMITTED', 'ARRIVED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('MANIFEST_MISMATCH', 'MISSING', 'OVERAGE', 'DAMAGED', 'OVERWEIGHT', 'CUSTOMS_HOLD', 'DOCUMENTATION_REQUIRED', 'ADDRESS_PROBLEM', 'OTHER');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "locker_packages" ADD COLUMN     "warehouse_id" UUID;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'ORIGIN',
    "country" TEXT NOT NULL,
    "city" TEXT,
    "address_line" TEXT,
    "allows_pickup" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "carrier_id" UUID,
    "flight_number" TEXT,
    "origin_warehouse_id" UUID,
    "destination_warehouse_id" UUID,
    "departure_at" TIMESTAMP(3),
    "arrival_at" TIMESTAMP(3),
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "trip_id" UUID,
    "status" "ManifestStatus" NOT NULL DEFAULT 'DRAFT',
    "total_pieces" INTEGER NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "received_pieces" INTEGER,
    "received_weight_kg" DECIMAL(12,3),
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifest_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "manifest_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(10,3) NOT NULL,
    "description" TEXT,
    "consignee" TEXT,
    "freight_amount" DECIMAL(12,2),
    "fob_value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "received_pieces" INTEGER,
    "received_weight_kg" DECIMAL(10,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manifest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "ExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "shipment_id" UUID,
    "package_id" UUID,
    "manifest_id" UUID,
    "description" TEXT NOT NULL,
    "expected_value" TEXT,
    "actual_value" TEXT,
    "assigned_to_user_id" UUID,
    "created_by_user_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_code_key" ON "warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "trips_tenant_id_idx" ON "trips"("tenant_id");

-- CreateIndex
CREATE INDEX "trips_tenant_id_status_idx" ON "trips"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "manifests_tenant_id_idx" ON "manifests"("tenant_id");

-- CreateIndex
CREATE INDEX "manifests_tenant_id_status_idx" ON "manifests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "manifests_tenant_id_number_key" ON "manifests"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "manifest_items_tenant_id_idx" ON "manifest_items"("tenant_id");

-- CreateIndex
CREATE INDEX "manifest_items_manifest_id_idx" ON "manifest_items"("manifest_id");

-- CreateIndex
CREATE UNIQUE INDEX "manifest_items_manifest_id_shipment_id_key" ON "manifest_items"("manifest_id", "shipment_id");

-- CreateIndex
CREATE INDEX "exceptions_tenant_id_idx" ON "exceptions"("tenant_id");

-- CreateIndex
CREATE INDEX "exceptions_tenant_id_status_idx" ON "exceptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "exceptions_shipment_id_idx" ON "exceptions"("shipment_id");

-- AddForeignKey
ALTER TABLE "locker_packages" ADD CONSTRAINT "locker_packages_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_warehouse_id_fkey" FOREIGN KEY ("origin_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifest_items" ADD CONSTRAINT "manifest_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifest_items" ADD CONSTRAINT "manifest_items_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifest_items" ADD CONSTRAINT "manifest_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "locker_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "manifests"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas. Prisma NO lo genera y olvidarlo no rompe nada
-- visiblemente: la tabla funciona, y deja los datos de todas las empresas al
-- alcance de cualquiera con sesión. El rol de la aplicación es NOBYPASSRLS, así
-- que estas políticas se aplican de verdad.
--
-- Aquí importa especialmente en `manifests` y `manifest_items`: un manifiesto
-- lleva el detalle comercial de las guías —consignatario, flete, valor FOB— de
-- todos los clientes de una empresa en un solo documento.
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouses_tenant_isolation ON "warehouses"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
CREATE POLICY trips_tenant_isolation ON "trips"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "manifests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manifests" FORCE ROW LEVEL SECURITY;
CREATE POLICY manifests_tenant_isolation ON "manifests"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "manifest_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manifest_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY manifest_items_tenant_isolation ON "manifest_items"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exceptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY exceptions_tenant_isolation ON "exceptions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
