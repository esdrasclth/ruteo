-- Multi-tenancy via Row-Level Security (RLS).
-- The app connects as a non-superuser role so RLS is actually enforced
-- (superusers and table owners bypass RLS). Migrations keep running as the
-- owner/superuser role.

-- 1. Dedicated runtime role (NOSUPERUSER, NOBYPASSRLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ruteo_app') THEN
    CREATE ROLE ruteo_app LOGIN PASSWORD 'ruteo_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ruteo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ruteo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ruteo_app;

-- Future tables/sequences created by the migration owner are auto-granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ruteo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ruteo_app;

-- 2. Helper: current tenant from the transaction-local GUC.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- 3. tenants is the platform registry: rows are scoped to the active tenant,
--    but INSERT is open so public SaaS signup can create a new tenant.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON "tenants"
  FOR SELECT USING (id = current_tenant_id());
CREATE POLICY tenants_update ON "tenants"
  FOR UPDATE USING (id = current_tenant_id());
CREATE POLICY tenants_delete ON "tenants"
  FOR DELETE USING (id = current_tenant_id());
CREATE POLICY tenants_insert ON "tenants"
  FOR INSERT WITH CHECK (true);

-- 4. users is tenant-scoped: every row must match the active tenant.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON "users"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
