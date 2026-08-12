-- CreateEnum
CREATE TYPE "PackageCondition" AS ENUM ('GOOD', 'DAMAGED', 'WET', 'OPENED');

-- CreateEnum
CREATE TYPE "PackageCategory" AS ENUM ('ELECTRONICS', 'CLOTHING', 'FOOTWEAR', 'HOME', 'AUTO_PARTS', 'COSMETICS', 'MEDICINE', 'DOCUMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "PackagePhotoType" AS ENUM ('EXTERIOR', 'LABEL', 'CONTENT', 'DAMAGE');

-- AlterTable
ALTER TABLE "locker_packages" ADD COLUMN     "category" "PackageCategory",
ADD COLUMN     "chargeable_weight_kg" DECIMAL(10,3),
ADD COLUMN     "condition" "PackageCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "estimated_arrival" TIMESTAMP(3),
ADD COLUMN     "height_cm" DECIMAL(8,2),
ADD COLUMN     "invoice_file_id" UUID,
ADD COLUMN     "length_cm" DECIMAL(8,2),
ADD COLUMN     "order_number" TEXT,
ADD COLUMN     "pieces" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "received_by_user_id" UUID,
ADD COLUMN     "store_name" TEXT,
ADD COLUMN     "volumetric_weight_kg" DECIMAL(10,3),
ADD COLUMN     "width_cm" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "volumetric_divisor" INTEGER NOT NULL DEFAULT 5000;

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "type" "PackagePhotoType" NOT NULL DEFAULT 'EXTERIOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_key_key" ON "file_objects"("key");

-- CreateIndex
CREATE INDEX "file_objects_tenant_id_idx" ON "file_objects"("tenant_id");

-- CreateIndex
CREATE INDEX "package_photos_tenant_id_idx" ON "package_photos"("tenant_id");

-- CreateIndex
CREATE INDEX "package_photos_package_id_idx" ON "package_photos"("package_id");

-- AddForeignKey
ALTER TABLE "locker_packages" ADD CONSTRAINT "locker_packages_invoice_file_id_fkey" FOREIGN KEY ("invoice_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_photos" ADD CONSTRAINT "package_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_photos" ADD CONSTRAINT "package_photos_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "locker_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_photos" ADD CONSTRAINT "package_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas. Prisma NO lo genera: hay que escribirlo a mano en
-- cada tabla que nazca, y olvidarlo no rompe nada visiblemente —la tabla
-- funciona— pero deja los datos de todas las empresas al alcance de cualquiera
-- con sesión. El rol de la aplicación es NOBYPASSRLS, así que esto se aplica.
--
-- `file_objects` guarda la clave del objeto en el bucket. Sin política, un
-- tenant podría listar las claves de otro y, con ellas, pedir una descarga
-- firmada: el almacenamiento no tiene RLS que lo detenga, la comprobación de
-- prefijo de `StorageService` es la única barrera y no debería ser la única.
ALTER TABLE "file_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_objects" FORCE ROW LEVEL SECURITY;
CREATE POLICY file_objects_tenant_isolation ON "file_objects"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "package_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "package_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY package_photos_tenant_isolation ON "package_photos"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
