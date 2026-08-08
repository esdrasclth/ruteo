-- CreateEnum
CREATE TYPE "TenantModule" AS ENUM ('SHIPMENTS', 'ROUTES', 'DRIVERS', 'INTAKE', 'LOCKERS', 'CARRIERS', 'CUSTOMERS', 'PRICING', 'PAYMENTS', 'BILLING', 'NOTIFICATIONS', 'AUDIT', 'INTEGRATIONS', 'CUSTOMS');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "status_at" TIMESTAMP(3),
ADD COLUMN     "status_reason" TEXT;

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "external_id" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_module_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "module" "TenantModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_module_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_external_id_key" ON "platform_admins"("external_id");

-- CreateIndex
CREATE INDEX "tenant_module_overrides_tenant_id_idx" ON "tenant_module_overrides"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_module_overrides_tenant_id_module_key" ON "tenant_module_overrides"("tenant_id", "module");

-- AddForeignKey
ALTER TABLE "tenant_module_overrides" ADD CONSTRAINT "tenant_module_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS de las excepciones de módulo. Es una tabla tenant-scoped como cualquier
-- otra: la escribe el superadmin (con el rol `ruteo`, que sí salta RLS) y la
-- lee el propio tenant. Sin política, una empresa podría ver —o cambiar— los
-- módulos de otra.
ALTER TABLE "tenant_module_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_module_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_module_overrides_tenant_isolation ON "tenant_module_overrides"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- `platform_admins` NO lleva RLS porque no es tenant-scoped: no hay `tenant_id`
-- por el que filtrar. En su lugar se le niega el acceso al rol de la aplicación.
--
-- Esto es lo que hace que la separación sea real y no una convención: aunque
-- alguien lograra ejecutar SQL arbitrario desde el backend de tenant, no puede
-- leer ni tocar la tabla de superadmins. Solo el rol `ruteo` —que usa el
-- servicio de plataforma— la alcanza.
REVOKE ALL ON TABLE "platform_admins" FROM ruteo_app;
