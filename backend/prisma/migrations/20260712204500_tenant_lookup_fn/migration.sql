-- Login needs to resolve a tenant by slug BEFORE a tenant context exists, but
-- RLS on `tenants` hides rows outside the active tenant. This SECURITY DEFINER
-- function runs as its owner (superuser) so it can look up the tenant id by slug
-- without leaking any other tenant data to the caller.
CREATE OR REPLACE FUNCTION tenant_id_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants WHERE slug = p_slug
$$;

REVOKE ALL ON FUNCTION tenant_id_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_id_by_slug(text) TO ruteo_app;
