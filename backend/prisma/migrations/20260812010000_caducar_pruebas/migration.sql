-- Caducidad de los planes de prueba que abre el registro.
--
-- Elegir un plan de pago al registrarse no activa nada cobrable: abre una
-- suscripción TRIALING con fecha de fin. Si nadie la convierte en suscripción de
-- verdad, al vencer la empresa cae a FREE. Sin esto, elegir ENTERPRISE en el
-- alta sería ENTERPRISE gratis y para siempre.
--
-- Cruza TODOS los tenants, y el rol de la aplicación es NOBYPASSRLS: sin
-- contexto de tenant no vería ni una fila. Mismo patrón que
-- `purgar_idempotencia` y `tenant_id_by_slug`: SECURITY DEFINER, sin
-- parámetros, y haciendo exactamente una cosa, para que conceder su ejecución no
-- abra ninguna otra puerta.
--
-- **La aplicación no depende de que esto corra.** El guard que resuelve el plan
-- en cada petición ya trata una prueba vencida como FREE (`planEfectivo`). Esta
-- función existe para que la BASE diga la verdad —informes, panel de plataforma,
-- listados— y no para sostener el control de acceso. Si dependiera de ella, un
-- worker parado regalaría planes de pago sin que nadie se enterara.
CREATE OR REPLACE FUNCTION caducar_pruebas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caducadas integer;
BEGIN
  WITH vencidas AS (
    UPDATE subscriptions
       SET status = 'CANCELED',
           canceled_at = now(),
           updated_at = now()
     WHERE status = 'TRIALING'
       AND current_period_end <= now()
    RETURNING tenant_id
  )
  UPDATE tenants t
     SET plan = 'FREE',
         updated_at = now()
    FROM vencidas v
   WHERE t.id = v.tenant_id;

  GET DIAGNOSTICS caducadas = ROW_COUNT;
  RETURN caducadas;
END;
$$;

REVOKE ALL ON FUNCTION caducar_pruebas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION caducar_pruebas() TO ruteo_app;

-- El barrido filtra por estas dos columnas. Sin índice recorrería la tabla
-- entera de suscripciones en cada pasada.
CREATE INDEX IF NOT EXISTS "subscriptions_status_period_end_idx"
  ON "subscriptions"("status", "current_period_end");
