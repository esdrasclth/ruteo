-- RLS for the Fase 3 tables (payments, api keys, webhooks). Every row is scoped
-- to the active tenant, mirroring the other domain tables. The runtime role
-- (ruteo_app) is NOBYPASSRLS, so these policies are enforced.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant_isolation ON "payments"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY api_keys_tenant_isolation ON "api_keys"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_tenant_isolation ON "webhook_endpoints"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant_isolation ON "webhook_deliveries"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- API-key auth must resolve a tenant BEFORE a tenant context exists, but RLS on
-- api_keys hides rows outside the active tenant. This SECURITY DEFINER function
-- runs as its owner so the guard can look up an active key by its public prefix
-- (returning the stored hash for verification) without leaking other tenants.
CREATE OR REPLACE FUNCTION api_key_by_prefix(p_prefix text)
RETURNS TABLE (tenant_id uuid, key_hash text, revoked_at timestamp)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id, key_hash, revoked_at FROM api_keys WHERE prefix = p_prefix
$$;

REVOKE ALL ON FUNCTION api_key_by_prefix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_key_by_prefix(text) TO ruteo_app;
