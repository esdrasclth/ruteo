-- CreateEnum
CREATE TYPE "CredentialTokenType" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateTable
CREATE TABLE "credential_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "CredentialTokenType" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_tokens_tenant_id_user_id_type_idx" ON "credential_tokens"("tenant_id", "user_id", "type");

-- AddForeignKey
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS para credential_tokens. La tabla guarda códigos de restablecimiento, así
-- que sin política un tenant podría leer (o gastar) los de otro. El rol de
-- ejecución (ruteo_app) es NOBYPASSRLS, de modo que esto se aplica de verdad.
ALTER TABLE "credential_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY credential_tokens_tenant_isolation ON "credential_tokens"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
