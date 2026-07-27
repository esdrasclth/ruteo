-- RLS for the international (USA -> HN) domain tables. Every row is scoped to the
-- active tenant, mirroring the shipment tables. The runtime role (ruteo_app) is
-- NOBYPASSRLS, so these policies are enforced; migrations run as the owner.
ALTER TABLE "carriers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carriers" FORCE ROW LEVEL SECURITY;
CREATE POLICY carriers_tenant_isolation ON "carriers"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "lockers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lockers" FORCE ROW LEVEL SECURITY;
CREATE POLICY lockers_tenant_isolation ON "lockers"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "locker_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locker_packages" FORCE ROW LEVEL SECURITY;
CREATE POLICY locker_packages_tenant_isolation ON "locker_packages"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "customs_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customs_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY customs_records_tenant_isolation ON "customs_records"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
