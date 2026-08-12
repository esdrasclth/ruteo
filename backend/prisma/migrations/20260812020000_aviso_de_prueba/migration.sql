-- Aviso previo al vencimiento de una prueba.
--
-- Sin esto, la prueba se acababa en silencio: la empresa entraba un día y le
-- faltaban módulos, sin haber recibido ni una advertencia. Y del lado de casa,
-- nadie sabía a quién había que llamar antes de perder la venta.

-- La marca de "ya avisado". Es lo que hace el aviso idempotente: el trabajo
-- corre cada doce horas, y sin esta columna una prueba a tres días de vencer
-- mandaría seis correos.
ALTER TABLE "subscriptions" ADD COLUMN "trial_warned_at" TIMESTAMP(3);

-- Buscar a quién avisar cruza TODOS los tenants, y el rol de la aplicación es
-- NOBYPASSRLS: sin contexto de tenant no ve ni una fila. Mismo patrón que
-- `tenants_by_user_email` y `purgar_idempotencia`.
--
-- **Solo LEE, y solo lo justo.** No marca nada ni manda nada: devuelve a quién
-- hay que escribir, y el resto —marcar como avisado, registrar la notificación—
-- lo hace la aplicación con el contexto del tenant ya puesto, o sea pasando por
-- RLS como cualquier otra escritura. Así esta función concede lo mínimo.
--
-- El correo sale de `billing_email` si está, y si no del OWNER de la empresa:
-- quien puso un correo de facturación quiere que lo de dinero llegue ahí.
CREATE OR REPLACE FUNCTION pruebas_por_avisar(p_dias integer)
RETURNS TABLE (
  out_tenant_id    uuid,
  out_tenant_name  text,
  out_slug         text,
  out_plan         text,
  out_period_end   timestamp(3),
  out_email        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    s.plan::text,
    s.current_period_end,
    COALESCE(
      NULLIF(t.billing_email, ''),
      (SELECT u.email
         FROM users u
        WHERE u.tenant_id = t.id
          AND u.role = 'OWNER'
          AND u.status = 'ACTIVE'
        ORDER BY u.created_at
        LIMIT 1)
    )
  FROM subscriptions s
  JOIN tenants t ON t.id = s.tenant_id
  WHERE s.status = 'TRIALING'
    AND s.trial_warned_at IS NULL
    -- Ya entró en la ventana de aviso, pero todavía no ha vencido: avisar de
    -- algo que ya caducó no es un aviso, es una nota de defunción.
    AND s.current_period_end <= now() + make_interval(days => p_dias)
    AND s.current_period_end > now()
  ORDER BY s.current_period_end
$$;

REVOKE ALL ON FUNCTION pruebas_por_avisar(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pruebas_por_avisar(integer) TO ruteo_app;
