-- Entrar desde el panel raíz con solo correo y contraseña necesita responder
-- "¿en qué empresas existe este correo?" ANTES de que haya contexto de tenant,
-- que es justo lo que el RLS impide: sin `current_tenant_id()` fijado, `users`
-- y `tenants` no devuelven ni una fila.
--
-- Mismo patrón que `tenant_id_by_slug`: SECURITY DEFINER para que corra como su
-- dueño y pueda mirar la tabla entera, pero devolviendo SOLO lo mínimo para
-- resolver el acceso. No sale de aquí nada del contenido de ninguna empresa.
--
-- **Esto no autoriza nada.** Devuelve candidatos; quien decide es la
-- comprobación de contraseña que se hace después contra ZITADEL, una por
-- candidato. Un correo que exista en tres empresas no da acceso a ninguna.
--
-- Los nombres de salida llevan prefijo `out_` a propósito: `tenant_id` y
-- `email` son columnas reales de `users`, y en una función SQL un parámetro de
-- salida que se llame igual que una columna hace la referencia ambigua y la
-- función revienta al crearse.
CREATE OR REPLACE FUNCTION tenants_by_user_email(p_email text)
RETURNS TABLE (
  out_tenant_id   uuid,
  out_tenant_slug text,
  out_tenant_name text,
  out_user_id     uuid,
  out_user_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.slug, t.name, u.id, u.status::text
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.email = lower(p_email)
  -- Orden estable: el selector de empresa no debe bailar entre dos intentos.
  ORDER BY t.name, t.slug
$$;

REVOKE ALL ON FUNCTION tenants_by_user_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_by_user_email(text) TO ruteo_app;
