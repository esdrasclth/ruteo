-- RLS for the shipment domain tables: every row is scoped to the active tenant.
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;
CREATE POLICY shipments_tenant_isolation ON "shipments"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "shipment_legs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipment_legs" FORCE ROW LEVEL SECURITY;
CREATE POLICY shipment_legs_tenant_isolation ON "shipment_legs"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "shipment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipment_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY shipment_events_tenant_isolation ON "shipment_events"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Public tracking resolves the owning tenant from a (globally unique) tracking
-- number without a tenant context, mirroring tenant_id_by_slug. SECURITY DEFINER
-- so it can read across RLS; it only returns the tenant id, never other data.
CREATE OR REPLACE FUNCTION tenant_id_by_tracking(p_tracking text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM shipments WHERE tracking_number = p_tracking
$$;

REVOKE ALL ON FUNCTION tenant_id_by_tracking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_id_by_tracking(text) TO ruteo_app;
