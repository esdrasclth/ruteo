-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "admin_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "target_label" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_audit_logs_target_type_target_id_idx" ON "platform_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");


-- Mismo trato que `platform_admins`: no es tenant-scoped, así que no hay
-- `tenant_id` por el que filtrar y RLS no aplica. Se le niega el acceso al rol
-- de la aplicación para que el historial de plataforma no sea legible —ni
-- alterable— desde el backend que sirve a las empresas.
REVOKE ALL ON TABLE "platform_audit_logs" FROM ruteo_app;
