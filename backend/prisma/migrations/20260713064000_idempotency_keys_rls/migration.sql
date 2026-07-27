-- RLS for the idempotency_keys table. Every row is scoped to the active tenant,
-- mirroring the other domain tables. The runtime role (ruteo_app) is
-- NOBYPASSRLS, so this policy is enforced.
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant_isolation ON "idempotency_keys"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
