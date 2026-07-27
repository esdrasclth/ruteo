-- Signup now sets the RLS context to the new tenant id before inserting, so we
-- can require the inserted row to match that context instead of allowing any
-- INSERT. This also keeps INSERT ... RETURNING consistent with the SELECT policy.
DROP POLICY IF EXISTS tenants_insert ON "tenants";
CREATE POLICY tenants_insert ON "tenants"
  FOR INSERT WITH CHECK (id = current_tenant_id());
