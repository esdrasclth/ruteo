-- RLS for the customers table. Every row is scoped to the active tenant,
-- mirroring the other domain tables. The runtime role (ruteo_app) is
-- NOBYPASSRLS, so this policy is enforced.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON "customers"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
