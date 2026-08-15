-- Alcances por llave de API.
--
-- Hasta aquí una llave era todo o nada: la que la empresa entrega a quien le
-- programó su web servía para cualquier endpoint que aceptara `x-api-key`.

CREATE TYPE "ApiScope" AS ENUM (
  'SHIPMENTS_READ',
  'SHIPMENTS_WRITE',
  'LOCKERS_READ',
  'LOCKERS_WRITE'
);

-- Por defecto vacío: una llave sin alcances no abre nada. Lo contrario —que el
-- valor por defecto sea «todo»— convierte cualquier alta futura por un camino
-- que aún no pida alcances en una llave omnipotente, y en silencio.
ALTER TABLE "api_keys"
  ADD COLUMN "scopes" "ApiScope"[] NOT NULL DEFAULT ARRAY[]::"ApiScope"[];

-- Las llaves ya emitidas conservan exactamente lo que podían hacer, ni más ni
-- menos: el único controlador que aceptaba `x-api-key` era el de envíos. Sin
-- este relleno, cada integración viva de los clientes se rompería en el
-- despliegue.
UPDATE "api_keys"
  SET "scopes" = ARRAY['SHIPMENTS_READ', 'SHIPMENTS_WRITE']::"ApiScope"[];

-- La función cambia de firma, así que hay que soltarla antes: `CREATE OR
-- REPLACE` no puede alterar el tipo de retorno.
--
-- Sigue siendo `SECURITY DEFINER` por la misma razón de siempre: el tenant hay
-- que resolverlo ANTES de que exista contexto de tenant, así que esta consulta
-- es la única que por fuerza mira `api_keys` sin pasar por RLS. Devolver los
-- alcances aquí evita una segunda lectura y, sobre todo, evita que quien la
-- escriba tenga que resolver otra vez el mismo problema del huevo y la gallina.
DROP FUNCTION IF EXISTS api_key_by_prefix(text);

CREATE FUNCTION api_key_by_prefix(p_prefix text)
RETURNS TABLE (tenant_id uuid, key_hash text, revoked_at timestamp, scopes "ApiScope"[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id, key_hash, revoked_at, scopes FROM api_keys WHERE prefix = p_prefix
$$;

REVOKE ALL ON FUNCTION api_key_by_prefix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_key_by_prefix(text) TO ruteo_app;
