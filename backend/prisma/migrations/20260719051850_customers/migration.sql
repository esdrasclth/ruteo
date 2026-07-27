-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "lockers" ADD COLUMN     "customer_id" UUID;

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "customer_id" UUID;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "document_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "lockers_customer_id_idx" ON "lockers"("customer_id");

-- CreateIndex
CREATE INDEX "shipments_customer_id_idx" ON "shipments"("customer_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lockers" ADD CONSTRAINT "lockers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one customer per existing locker, then link the locker to it.
-- MATERIALIZED keeps the generated customer ids stable across both references.
WITH ins AS MATERIALIZED (
    SELECT
        l.id AS locker_id,
        gen_random_uuid() AS customer_id,
        l.tenant_id,
        l.customer_name,
        l.customer_email,
        l.customer_phone
    FROM "lockers" l
),
created AS (
    INSERT INTO "customers" (id, tenant_id, name, email, phone, created_at, updated_at)
    SELECT customer_id, tenant_id, customer_name, customer_email, customer_phone, now(), now()
    FROM ins
    RETURNING id
)
UPDATE "lockers" l
SET customer_id = ins.customer_id
FROM ins
WHERE l.id = ins.locker_id;

-- Backfill: link shipments to the customer of the locker that fed them.
UPDATE "shipments" s
SET customer_id = l.customer_id
FROM "locker_packages" lp
JOIN "lockers" l ON l.id = lp.locker_id
WHERE lp.shipment_id = s.id
  AND l.customer_id IS NOT NULL
  AND s.customer_id IS NULL;
