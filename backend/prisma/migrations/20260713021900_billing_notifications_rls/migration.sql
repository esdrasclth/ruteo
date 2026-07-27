-- RLS for the billing/notifications tables. Every row is scoped to the active
-- tenant, mirroring the other domain tables. The runtime role (ruteo_app) is
-- NOBYPASSRLS, so these policies are enforced.
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_tenant_isolation ON "subscriptions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON "notifications"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
