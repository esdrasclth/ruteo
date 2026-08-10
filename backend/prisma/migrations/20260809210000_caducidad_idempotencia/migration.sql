-- Caducidad de las claves de idempotencia.
--
-- La tabla no tenía ni caducidad ni limpieza: cada petición con
-- `Idempotency-Key` dejaba una fila con el CUERPO COMPLETO de la respuesta en
-- JSONB, para siempre. Una integración que mande la cabecera en cada alta de
-- envío —que es justo para lo que existe— acaba guardando una copia de cada
-- envío creado, y en un VPS eso termina llenando el disco de Postgres.

ALTER TABLE "idempotency_keys" ADD COLUMN "expires_at" TIMESTAMP(3);

-- Las filas que ya existen heredan 24 h desde su creación, así que las
-- antiguas quedan caducadas de inmediato y la primera purga se las lleva.
UPDATE "idempotency_keys"
   SET "expires_at" = "created_at" + interval '24 hours'
 WHERE "expires_at" IS NULL;

ALTER TABLE "idempotency_keys" ALTER COLUMN "expires_at" SET NOT NULL;

-- La purga barre por esta columna; sin índice recorrería la tabla entera, que
-- es precisamente lo que puede haberse hecho grande.
CREATE INDEX "idempotency_keys_expires_at_idx"
  ON "idempotency_keys"("expires_at");

-- La purga cruza TODOS los tenants, y el rol de la aplicación es NOBYPASSRLS:
-- desde él, un DELETE sin contexto de tenant no borra ni una fila. Mismo patrón
-- que `tenant_id_by_slug`: una función SECURITY DEFINER que corre como el dueño
-- del esquema y a la que solo se le concede lo justo.
--
-- Es deliberadamente estrecha —solo borra lo YA caducado, no acepta parámetros
-- y no lee nada— para que conceder su ejecución no abra ninguna otra puerta.
CREATE OR REPLACE FUNCTION purgar_idempotencia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  borradas integer;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at <= now();
  GET DIAGNOSTICS borradas = ROW_COUNT;
  RETURN borradas;
END
$$;

REVOKE ALL ON FUNCTION purgar_idempotencia() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purgar_idempotencia() TO ruteo_app;
