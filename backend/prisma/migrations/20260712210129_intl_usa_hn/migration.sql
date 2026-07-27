-- CreateEnum
CREATE TYPE "CarrierType" AS ENUM ('COURIER', 'AIRLINE', 'OCEAN', 'GROUND');

-- CreateEnum
CREATE TYPE "LockerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('PRE_ALERTED', 'RECEIVED', 'CONSOLIDATED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "CustomsStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'ON_HOLD', 'CLEARED', 'REJECTED');

-- AlterTable
ALTER TABLE "shipment_legs" ADD COLUMN     "carrier_id" UUID,
ADD COLUMN     "destination_lat" DOUBLE PRECISION,
ADD COLUMN     "destination_lng" DOUBLE PRECISION,
ADD COLUMN     "origin_lat" DOUBLE PRECISION,
ADD COLUMN     "origin_lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "carriers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CarrierType" NOT NULL DEFAULT 'COURIER',
    "tracking_url_template" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lockers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "status" "LockerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locker_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "locker_id" UUID NOT NULL,
    "shipment_id" UUID,
    "external_tracking" TEXT,
    "merchant" TEXT,
    "description" TEXT,
    "weight_kg" DECIMAL(10,3),
    "declared_value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PackageStatus" NOT NULL DEFAULT 'PRE_ALERTED',
    "pre_alerted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locker_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "status" "CustomsStatus" NOT NULL DEFAULT 'PENDING',
    "declared_value" DECIMAL(12,2),
    "duty_amount" DECIMAL(12,2),
    "tax_amount" DECIMAL(12,2),
    "handling_fee" DECIMAL(12,2),
    "total_charges" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carriers_tenant_id_idx" ON "carriers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "carriers_tenant_id_code_key" ON "carriers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "lockers_tenant_id_idx" ON "lockers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lockers_tenant_id_code_key" ON "lockers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "locker_packages_tenant_id_idx" ON "locker_packages"("tenant_id");

-- CreateIndex
CREATE INDEX "locker_packages_locker_id_idx" ON "locker_packages"("locker_id");

-- CreateIndex
CREATE INDEX "locker_packages_shipment_id_idx" ON "locker_packages"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "customs_records_shipment_id_key" ON "customs_records"("shipment_id");

-- CreateIndex
CREATE INDEX "customs_records_tenant_id_idx" ON "customs_records"("tenant_id");

-- CreateIndex
CREATE INDEX "shipment_legs_carrier_id_idx" ON "shipment_legs"("carrier_id");

-- AddForeignKey
ALTER TABLE "shipment_legs" ADD CONSTRAINT "shipment_legs_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lockers" ADD CONSTRAINT "lockers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_packages" ADD CONSTRAINT "locker_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_packages" ADD CONSTRAINT "locker_packages_locker_id_fkey" FOREIGN KEY ("locker_id") REFERENCES "lockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_packages" ADD CONSTRAINT "locker_packages_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_records" ADD CONSTRAINT "customs_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_records" ADD CONSTRAINT "customs_records_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
