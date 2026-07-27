-- CreateEnum
CREATE TYPE "ShipmentType" AS ENUM ('LOCAL', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'RECEIVED_USA', 'CONSOLIDATED', 'IN_TRANSIT_INTL', 'IN_CUSTOMS_HN', 'CUSTOMS_CLEARED', 'IN_WAREHOUSE_HN', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED', 'CANCELLED', 'ON_HOLD_CUSTOMS');

-- CreateEnum
CREATE TYPE "LegMode" AS ENUM ('AIR', 'SEA', 'GROUND');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "type" "ShipmentType" NOT NULL DEFAULT 'LOCAL',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "origin_label" TEXT,
    "origin_country" TEXT,
    "destination_label" TEXT,
    "destination_country" TEXT,
    "destination_lat" DOUBLE PRECISION,
    "destination_lng" DOUBLE PRECISION,
    "weight_kg" DECIMAL(10,3),
    "declared_value" DECIMAL(12,2),
    "cod_amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "carrier_tracking_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_legs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" "LegMode" NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "status" "LegStatus" NOT NULL DEFAULT 'PENDING',
    "carrier" TEXT,
    "external_tracking" TEXT,
    "eta_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "leg_id" UUID,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT,
    "location_label" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_by_user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "shipments_tenant_id_idx" ON "shipments"("tenant_id");

-- CreateIndex
CREATE INDEX "shipments_tenant_id_status_idx" ON "shipments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "shipment_legs_tenant_id_idx" ON "shipment_legs"("tenant_id");

-- CreateIndex
CREATE INDEX "shipment_legs_shipment_id_idx" ON "shipment_legs"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_legs_shipment_id_sequence_key" ON "shipment_legs"("shipment_id", "sequence");

-- CreateIndex
CREATE INDEX "shipment_events_tenant_id_idx" ON "shipment_events"("tenant_id");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_legs" ADD CONSTRAINT "shipment_legs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
