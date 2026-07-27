-- RLS for the audit_logs table. Every row is scoped to the active tenant,
-- mirroring the other domain tables. The runtime role (ruteo_app) is
-- NOBYPASSRLS, so this policy is enforced.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant_isolation ON "audit_logs"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
