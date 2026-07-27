-- RLS for the logistics domain tables (Fase 2). Every row is scoped to the
-- active tenant, mirroring the other domain tables. The runtime role (ruteo_app)
-- is NOBYPASSRLS, so these policies are enforced; migrations run as the owner.
ALTER TABLE "zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zones" FORCE ROW LEVEL SECURITY;
CREATE POLICY zones_tenant_isolation ON "zones"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY rates_tenant_isolation ON "rates"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "drivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drivers" FORCE ROW LEVEL SECURITY;
CREATE POLICY drivers_tenant_isolation ON "drivers"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routes" FORCE ROW LEVEL SECURITY;
CREATE POLICY routes_tenant_isolation ON "routes"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "route_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route_stops" FORCE ROW LEVEL SECURITY;
CREATE POLICY route_stops_tenant_isolation ON "route_stops"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "proof_of_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proof_of_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY proof_of_deliveries_tenant_isolation ON "proof_of_deliveries"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
